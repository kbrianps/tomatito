//! O som (PLANO.md, M20): os dois WAVs embutidos e uma thread que os toca.
//!
//! **Uma thread, um canal.** O motor e o `sound_test` só mandam um [`Pedido`]
//! pelo canal e voltam na hora; quem espera o som acabar é a thread
//! `tomatito-som`. Para cada pedido, ela:
//!
//! 1. abre a saída padrão (`DeviceSinkBuilder::open_default_sink()`);
//! 2. decodifica o WAV embutido (`Cursor` sobre `include_bytes!`), aplica o
//!    volume e o põe no mixer (`mixer().add(...)`);
//! 3. segura a saída aberta por [`SEGURAR`] e a fecha.
//!
//! Abrir a saída a cada pedido, e não uma vez no começo, é o que faz trocar de
//! saída (um fone, por exemplo) valer no som seguinte sem reiniciar o app; e
//! com a saída fechada entre um som e outro o app não segura o dispositivo de
//! áudio nem mantém um fluxo mudo aberto o dia inteiro.
//!
//! **Volume.** O [`Som`] guarda o volume (0 a 100) e o aplica a cada pedido.
//! Até as configurações existirem (M38), é o [`VOLUME_PADRAO`]; num build de
//! debug, `TOMATITO_VOLUME` o troca (os testes automáticos tocam a 1%, para
//! não soar alto na máquina de quem roda). No release, a variável não é lida.
//!
//! **Erro nunca derruba o app.** Sem dispositivo, com o WAV ruim ou com um
//! pânico dentro do rodio, a thread registra no stderr e segue para o pedido
//! seguinte. Se a própria thread tiver morrido, o [`Som::tocar`] só registra.

use std::io::Cursor;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use rodio::{Decoder, DeviceSinkBuilder, Source};
use tomatito_core::Sound;

/// Os WAVs gerados por `scripts/gen-sounds.py` (mono, 44,1 kHz, 16 bits, 1 s).
const FOCUS_END: &[u8] = include_bytes!("../sounds/focus-end.wav");
const BREAK_END: &[u8] = include_bytes!("../sounds/break-end.wav");

/// Quanto tempo a saída fica aberta depois de receber o som: o WAV tem 1 s, e
/// a folga cobre o buffer do dispositivo (fechar antes corta o fim).
pub const SEGURAR: Duration = Duration::from_millis(1500);

/// O volume até existir a configuração (`volume` da 3.3, no M38), de 0 a 100.
pub const VOLUME_PADRAO: u8 = 80;

/// Os bytes do WAV de cada som.
pub fn wav(sound: Sound) -> &'static [u8] {
    match sound {
        Sound::FocusEnd => FOCUS_END,
        Sound::BreakEnd => BREAK_END,
    }
}

/// Um pedido para a thread: qual som e com que volume (0 a 100).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pedido {
    pub sound: Sound,
    pub volume: u8,
}

impl Pedido {
    /// O fator do `amplify`: linear, de 0,0 a 1,0.
    pub fn ganho(&self) -> f32 {
        f32::from(self.volume.min(100)) / 100.0
    }
}

/// A ponta do app: manda pedidos para a thread de som.
pub struct Som {
    // O `Sender` é `Sync` desde o Rust 1.72; o `Mutex` fica pelo `Sync` em
    // versões com o `Sender` antigo e custa nada perto de tocar um som.
    tx: Mutex<Sender<Pedido>>,
    volume: AtomicU8,
}

impl Som {
    /// Sobe a thread `tomatito-som`, que toca na saída padrão do sistema, com
    /// o volume de [`volume_do_ambiente`].
    pub fn iniciar() -> Self {
        let som = Self::com_saida(tocar_na_saida_padrao);
        som.definir_volume(volume_do_ambiente());
        som
    }

    /// Sobe a thread com outra forma de tocar (os testes usam uma que só anota).
    pub fn com_saida<F>(tocar: F) -> Self
    where
        F: FnMut(Pedido) -> Result<(), String> + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        let criada = thread::Builder::new()
            .name("tomatito-som".into())
            .spawn(move || atender(rx, tocar));
        if let Err(e) = criada {
            // Sem a thread, o `send` falha e cada pedido só é registrado.
            eprintln!("[tomatito] som: não foi possível criar a thread: {e}");
        }
        Self {
            tx: Mutex::new(tx),
            volume: AtomicU8::new(VOLUME_PADRAO),
        }
    }

    /// O volume dos próximos sons, de 0 a 100 (o M38 o liga às configurações).
    pub fn definir_volume(&self, volume: u8) {
        self.volume.store(volume.min(100), Ordering::Relaxed);
    }

    pub fn volume(&self) -> u8 {
        self.volume.load(Ordering::Relaxed)
    }

    /// Pede um som, com o volume atual, e volta na hora. Nunca falha: um erro
    /// vira log.
    pub fn tocar(&self, sound: Sound) {
        let volume = self.volume();
        let tx = self.tx.lock().unwrap_or_else(|e| e.into_inner());
        if tx.send(Pedido { sound, volume }).is_err() {
            eprintln!("[tomatito] som: a thread de som não está rodando; {sound:?} não tocou");
        }
    }
}

/// O volume inicial: o [`VOLUME_PADRAO`] ou, num build de debug, o
/// `TOMATITO_VOLUME` (0 a 100). Um valor inválido é registrado e ignorado.
pub fn volume_do_ambiente() -> u8 {
    #[cfg(debug_assertions)]
    if let Ok(v) = std::env::var("TOMATITO_VOLUME") {
        match v.trim().parse::<u8>() {
            Ok(n) if n <= 100 => {
                eprintln!("[tomatito] volume do som: {n}%");
                return n;
            }
            _ => eprintln!("[tomatito] TOMATITO_VOLUME inválido ({v:?}); usando {VOLUME_PADRAO}%"),
        }
    }
    VOLUME_PADRAO
}

/// O laço da thread: um pedido por vez, na ordem, até o app fechar (o canal
/// fecha quando o [`Som`] é descartado).
fn atender<F>(rx: Receiver<Pedido>, mut tocar: F)
where
    F: FnMut(Pedido) -> Result<(), String>,
{
    for pedido in rx {
        match catch_unwind(AssertUnwindSafe(|| tocar(pedido))) {
            Ok(Ok(())) => {}
            Ok(Err(e)) => eprintln!("[tomatito] som: {:?} não tocou: {e}", pedido.sound),
            Err(_) => eprintln!(
                "[tomatito] som: pânico ao tocar {:?}; seguindo",
                pedido.sound
            ),
        }
    }
}

/// Decodifica o WAV embutido e aplica o volume.
pub fn fonte(pedido: Pedido) -> Result<impl Source + Send + 'static, String> {
    let decoder = Decoder::new_wav(Cursor::new(wav(pedido.sound)))
        .map_err(|e| format!("WAV inválido: {e}"))?;
    Ok(decoder.amplify(pedido.ganho()))
}

/// Os três passos do M20 na saída padrão do momento.
fn tocar_na_saida_padrao(pedido: Pedido) -> Result<(), String> {
    if pedido.volume == 0 {
        return Ok(());
    }
    let fonte = fonte(pedido)?;
    let mut saida =
        DeviceSinkBuilder::open_default_sink().map_err(|e| format!("sem saída de áudio: {e}"))?;
    // Fechar a saída é o esperado aqui; sem isto, o rodio avisa no stderr.
    saida.log_on_drop(false);
    saida.mixer().add(fonte);
    thread::sleep(SEGURAR);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Instant;

    /// Cabeçalho RIFF/WAVE canônico de 44 bytes, como o `wave` do Python grava.
    fn cabecalho(bytes: &[u8]) -> (u16, u16, u32, u16, u32) {
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[12..16], b"fmt ");
        let u16_em = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
        let u32_em =
            |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
        assert_eq!(&bytes[36..40], b"data");
        (u16_em(20), u16_em(22), u32_em(24), u16_em(34), u32_em(40))
    }

    #[test]
    fn os_wavs_sao_mono_44k1_16_bits_com_1_s() {
        for sound in [Sound::FocusEnd, Sound::BreakEnd] {
            let (formato, canais, taxa, bits, dados) = cabecalho(wav(sound));
            assert_eq!(formato, 1, "{sound:?}: PCM");
            assert_eq!(canais, 1, "{sound:?}: mono");
            assert_eq!(taxa, 44_100, "{sound:?}: 44,1 kHz");
            assert_eq!(bits, 16, "{sound:?}: 16 bits");
            let segundos = f64::from(dados) / f64::from(taxa * 2);
            assert!((0.9..=1.1).contains(&segundos), "{sound:?}: {segundos} s");
        }
    }

    #[test]
    fn o_rodio_decodifica_os_dois_e_o_volume_escala() {
        for sound in [Sound::FocusEnd, Sound::BreakEnd] {
            let cheio: Vec<f32> = fonte(Pedido { sound, volume: 100 }).unwrap().collect();
            let metade: Vec<f32> = fonte(Pedido { sound, volume: 50 }).unwrap().collect();
            assert_eq!(cheio.len(), 44_100, "{sound:?}");
            let pico = |v: &[f32]| v.iter().fold(0f32, |m, s| m.max(s.abs()));
            assert!(
                pico(&cheio) > 0.3 && pico(&cheio) < 1.0,
                "{sound:?}: pico {}",
                pico(&cheio)
            );
            assert!((pico(&metade) - pico(&cheio) / 2.0).abs() < 1e-3);
            // Começa e termina em silêncio: sem estalo.
            assert!(cheio[0].abs() < 1e-3 && cheio[cheio.len() - 1].abs() < 1e-3);
        }
    }

    #[test]
    fn fim_de_foco_tem_duas_notas_e_fim_de_intervalo_uma() {
        // Conta os ataques: janelas de 10 ms cuja energia sobe mais de 30%
        // em relação à anterior (com silêncio antes da primeira).
        let ataques = |sound| {
            let v: Vec<f32> = fonte(Pedido { sound, volume: 100 }).unwrap().collect();
            let rms: Vec<f32> = std::iter::once(0.0)
                .chain(
                    v.chunks(441)
                        .map(|c| (c.iter().map(|s| s * s).sum::<f32>() / c.len() as f32).sqrt()),
                )
                .collect();
            rms.windows(2)
                .filter(|w| w[1] > 0.05 && w[1] > w[0] * 1.3)
                .count()
        };
        assert_eq!(ataques(Sound::FocusEnd), 2);
        assert_eq!(ataques(Sound::BreakEnd), 1);
    }

    #[test]
    fn volume_satura_em_100() {
        let som = Som::com_saida(|_| Ok(()));
        assert_eq!(som.volume(), VOLUME_PADRAO);
        som.definir_volume(250);
        assert_eq!(som.volume(), 100);
    }

    #[test]
    fn ganho_vai_de_0_a_1_e_satura_em_100() {
        let p = |volume| {
            Pedido {
                sound: Sound::BreakEnd,
                volume,
            }
            .ganho()
        };
        assert_eq!(p(0), 0.0);
        assert_eq!(p(80), 0.8);
        assert_eq!(p(100), 1.0);
        assert_eq!(p(255), 1.0);
    }

    /// Espera até `n` pedidos serem atendidos (ou 5 s).
    fn esperar(anotados: &Arc<Mutex<Vec<Pedido>>>, n: usize) -> Vec<Pedido> {
        let limite = Instant::now() + Duration::from_secs(5);
        loop {
            let v = anotados.lock().unwrap().clone();
            if v.len() >= n || Instant::now() > limite {
                return v;
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn a_thread_atende_na_ordem_e_sobrevive_a_erro_e_a_panico() {
        let anotados = Arc::new(Mutex::new(Vec::new()));
        let a = anotados.clone();
        let som = Som::com_saida(move |p: Pedido| {
            a.lock().unwrap().push(p);
            match p.volume {
                1 => Err("sem saída de áudio".into()),
                2 => panic!("pânico de teste"),
                _ => Ok(()),
            }
        });
        let antes = Instant::now();
        som.definir_volume(1);
        som.tocar(Sound::FocusEnd); // erro
        som.definir_volume(2);
        som.tocar(Sound::BreakEnd); // pânico
        assert_eq!(som.volume(), 2);
        som.definir_volume(80);
        som.tocar(Sound::FocusEnd);
        som.tocar(Sound::BreakEnd);
        // O `tocar` não espera o som.
        assert!(antes.elapsed() < Duration::from_millis(100));
        let v = esperar(&anotados, 4);
        let resumo: Vec<_> = v.iter().map(|p| (p.sound, p.volume)).collect();
        assert_eq!(
            resumo,
            [
                (Sound::FocusEnd, 1),
                (Sound::BreakEnd, 2),
                (Sound::FocusEnd, 80),
                (Sound::BreakEnd, 80)
            ]
        );
    }

    /// Toca de verdade na saída padrão, com o volume em 1% (quase mudo). Não
    /// roda no `cargo test`: `cargo test -p tomatito audio -- --ignored`.
    #[test]
    #[ignore = "abre a saída de áudio da máquina"]
    fn toca_na_saida_padrao_de_verdade() {
        for sound in [Sound::FocusEnd, Sound::BreakEnd] {
            tocar_na_saida_padrao(Pedido { sound, volume: 1 }).unwrap();
        }
    }
}
