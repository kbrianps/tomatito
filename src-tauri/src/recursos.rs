//! Os recursos da plataforma (PLANO.md, 3.8 e M39): o que o sistema em que o
//! app roda permite, para as telas esconderem as opções que não se aplicam.
//! Vão no `get_state` como `recursos`, e o `src/platform/recursos.js` monta
//! com eles o objeto `{ bandeja, sempreNaFrente, regiaoDeEntrada }` do JS.
//! Nada de `if (os === 'linux')` espalhado pelas telas: a decisão é daqui.
//!
//! - **`bandeja`**: o ícone da bandeja existe (M36). No Windows, sempre; no
//!   Linux, quando o AppIndicator pôde ser criado (sem a biblioteca, o app
//!   segue sem bandeja, e o "Tempo na bandeja" some).
//! - **`sempreNaFrente`**: o app consegue pôr uma janela sempre na frente
//!   por código (o `tomatoOnTop` do Full). No Windows e no X11, sim; no
//!   Wayland, não: lá é o usuário, pelo Alt+Espaço (3.8).
//! - **`regiaoDeEntrada`**: a `tomato` pode ter região de entrada (5.1): no
//!   Windows, `SetWindowRgn`; no Linux, a região no `GtkWidget`, que o spike
//!   do M05 confirmou no Wayland (veredito A) e que o GTK também faz no X11.
//!
//! No Linux, Wayland ou X11 sai do `WAYLAND_DISPLAY` e do `GDK_BACKEND`, lidos
//! a cada `get_state` (a opção `linuxX11` põe `GDK_BACKEND=x11` antes do
//! GTK, 5.9, e a leitura a vê).

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recursos {
    pub bandeja: bool,
    pub sempre_na_frente: bool,
    pub regiao_de_entrada: bool,
}

/// O servidor gráfico do app no Linux.
#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sessao {
    Wayland,
    X11,
}

/// Qual backend o GDK 3 escolhe (`gdk_display_manager_open_display`): o
/// `GDK_BACKEND` é uma lista separada por vírgulas, tentada em ordem, em que
/// `*` quer dizer "qualquer um", na ordem do GDK (Wayland antes do X11). Sem a
/// variável, vale `*`. O Wayland só abre com um servidor (`WAYLAND_DISPLAY`);
/// o X11 é o que sobra. Um `GDK_BACKEND=wayland` sem `WAYLAND_DISPLAY` ainda
/// tenta o socket padrão (`wayland-0`), então conta como Wayland.
#[cfg(any(target_os = "linux", test))]
pub fn sessao_linux(wayland_display: Option<&str>, gdk_backend: Option<&str>) -> Sessao {
    let tem_wayland = wayland_display.is_some_and(|v| !v.trim().is_empty());
    let padrao = if tem_wayland {
        Sessao::Wayland
    } else {
        Sessao::X11
    };
    let lista = gdk_backend.map(str::trim).filter(|v| !v.is_empty());
    let Some(lista) = lista else {
        return padrao;
    };
    let mut pediu_wayland = false;
    for b in lista.split(',').map(str::trim) {
        match b {
            "*" => return padrao,
            "x11" => return Sessao::X11,
            "wayland" if tem_wayland => return Sessao::Wayland,
            "wayland" => pediu_wayland = true,
            _ => {}
        }
    }
    if pediu_wayland {
        Sessao::Wayland
    } else {
        padrao
    }
}

/// Os recursos do Linux numa sessão.
#[cfg(any(target_os = "linux", test))]
pub fn linux(bandeja: bool, sessao: Sessao) -> Recursos {
    Recursos {
        bandeja,
        sempre_na_frente: sessao == Sessao::X11,
        regiao_de_entrada: true,
    }
}

/// Os recursos desta máquina agora. `bandeja`: se o ícone foi criado
/// (`tray::Bandeja::existe`).
#[cfg(target_os = "linux")]
pub fn agora(bandeja: bool) -> Recursos {
    let var = |n: &str| std::env::var(n).ok();
    linux(
        bandeja,
        sessao_linux(
            var("WAYLAND_DISPLAY").as_deref(),
            var("GDK_BACKEND").as_deref(),
        ),
    )
}

#[cfg(windows)]
pub fn agora(bandeja: bool) -> Recursos {
    Recursos {
        bandeja,
        sempre_na_frente: true,
        regiao_de_entrada: true,
    }
}

/// Fora da v1 (só Linux e Windows): nada além da bandeja.
#[cfg(not(any(target_os = "linux", windows)))]
pub fn agora(bandeja: bool) -> Recursos {
    Recursos {
        bandeja,
        sempre_na_frente: false,
        regiao_de_entrada: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sessao_pelo_wayland_display_e_pelo_gdk_backend() {
        use Sessao::{Wayland, X11};
        let w = Some("wayland-0");
        // Sem GDK_BACKEND: Wayland se houver servidor; senão, X11.
        assert_eq!(sessao_linux(w, None), Wayland);
        assert_eq!(sessao_linux(None, None), X11);
        assert_eq!(sessao_linux(Some(""), None), X11);
        assert_eq!(sessao_linux(w, Some("")), Wayland);
        // B2 (5.9): a linuxX11 põe GDK_BACKEND=x11, e o GTK vai pelo Xwayland.
        assert_eq!(sessao_linux(w, Some("x11")), X11);
        assert_eq!(sessao_linux(w, Some("wayland")), Wayland);
        assert_eq!(sessao_linux(w, Some("*")), Wayland);
        assert_eq!(sessao_linux(None, Some("*")), X11);
        // A lista vale na ordem; o Wayland sem servidor passa para o seguinte.
        assert_eq!(sessao_linux(w, Some("x11,wayland")), X11);
        assert_eq!(sessao_linux(w, Some("wayland,x11")), Wayland);
        assert_eq!(sessao_linux(None, Some("wayland,x11")), X11);
        assert_eq!(sessao_linux(w, Some(" broadway , x11 ")), X11);
        // Só "wayland", sem WAYLAND_DISPLAY: o GDK tenta o wayland-0.
        assert_eq!(sessao_linux(None, Some("wayland")), Wayland);
    }

    #[test]
    fn no_wayland_nada_de_sempre_na_frente() {
        let wayland = linux(true, Sessao::Wayland);
        assert!(!wayland.sempre_na_frente);
        assert!(wayland.regiao_de_entrada, "veredito A do spike (M05)");
        assert!(linux(true, Sessao::X11).sempre_na_frente);
        assert!(!linux(false, Sessao::X11).bandeja);
    }

    #[test]
    fn no_get_state_em_camel_case() {
        assert_eq!(
            serde_json::to_value(linux(true, Sessao::Wayland)).unwrap(),
            json!({ "bandeja": true, "sempreNaFrente": false, "regiaoDeEntrada": true })
        );
    }

    #[test]
    fn agora_segue_a_bandeja() {
        assert!(agora(true).bandeja);
        assert!(!agora(false).bandeja);
    }
}
