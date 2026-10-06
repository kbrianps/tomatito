// A agenda dos avisos de fim (PLANO-ANDROID 5.2, A09): só o Android a usa;
// no desktop, só os testes a compilam.
#[cfg(desktop)]
mod acoes;
#[cfg(windows)]
mod acoes_windows;
#[cfg(any(test, target_os = "android"))]
mod agenda;
mod anuncio;
mod audio;
mod avisos;
mod commands;
mod compat_x11;
mod engine;
mod notify;
mod persist;
#[cfg(desktop)]
mod progresso;
mod recursos;
mod settings;
mod state_file;
mod stats;
mod tasks;
#[cfg(desktop)]
mod tray;
mod update;
// No Android, a mesma API sem bandeja (A03, PLANO-ANDROID 4.1).
#[cfg(mobile)]
#[path = "tray_mobile.rs"]
mod tray;
mod window;

// Vieram para o tomatito-motor (PLANO-WEB, 3.3, W04a), sem mudar o conteúdo.
pub use tomatito_motor::{events, i18n};

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Um `generate_context!` só: ele embute a página no binário.
    let context = tauri::generate_context!();
    // 3.3 (M56): no Windows 10, o `tomatoOnTop` nasce desligado (#15947). O
    // padrão mora no motor (W04b), que não pergunta a versão ao sistema; ela
    // vai para lá antes de qualquer leitura das configurações. Sem a versão,
    // vale o do Windows 11.
    #[cfg(windows)]
    settings::definir_tomato_on_top_padrao(
        window::region_windows::versao()
            .is_none_or(|(maior, build)| settings::windows_11_ou_mais(maior, build)),
    );
    // B2 (5.9): a `linuxX11` é lida antes do `Builder`, porque o GDK escolhe
    // o backend quando o GTK inicia (3.3).
    #[cfg(target_os = "linux")]
    compat_x11::usar_x11_se_pedido(&context.config().identifier);
    // Plugins na ordem da 3.4. O single-instance é o primeiro (a documentação
    // oficial pede): numa segunda abertura, ele avisa a instância que já roda
    // e sai antes de qualquer outro plugin ou do `setup` (M37). A instância
    // que roda aplica a regra de "Mostrar Tomatito" (3.4). No Linux, o aviso
    // vai pelo D-Bus, com o nome do `identifier`: o `dev:app` (`.dev`) e o
    // app instalado não se confundem.
    #[cfg(desktop)]
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // v0.5: uma segunda abertura com `--acao=...` (o menu do ícone na
            // dock ou na barra de tarefas) só executa a ação, sem mexer nas
            // janelas.
            if let Some(acao) = acoes::dos_argumentos(&argv) {
                acoes::executar(app, acao);
                return;
            }
            window::mostrar(app)
        }));
    // No Android, nem ele nem o window-state (A03, PLANO-ANDROID 4.1): o
    // sistema garante uma instância só, e a janela ocupa a tela.
    #[cfg(mobile)]
    let builder = tauri::Builder::default();
    // O plugin próprio (A07a, PLANO-ANDROID 4.2): permissões de aviso, cor
    // das barras do sistema e, nos próximos marcos, alarmes e notificações.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_tomatito_android::init());
    // O de notificação só existe no Windows; no Linux, o `notify.rs` fala
    // direto com o D-Bus (docs/decisoes.md, M21).
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_notification::init());
    #[cfg(desktop)]
    let builder = builder
        // O window-state com as flags restritas (3.4, M37): sem `VISIBLE`
        // (quem sai com a janela escondida na bandeja reabriria sem janela) e
        // sem `DECORATIONS` (a barra é própria). No Wayland, a posição não
        // existe para o app: voltam o tamanho e o maximizado. A `tomato` fica
        // de fora: o tamanho dela vem do `tomatoSize` (5).
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window::ESTADO_DA_JANELA)
                .with_denylist(&[window::TOMATO_LABEL])
                .build(),
        )
        // v0.3: a atualização por dentro do app (update.rs). Os comandos do
        // plugin não são liberados à página: quem fala com ele é o Rust.
        .plugin(tauri_plugin_updater::Builder::new().build());
    // Fechar (X, Ctrl+W, Alt+F4) com "fechar para a bandeja" ligado só
    // esconde a `main` (3.4, M36). No Android, não há o que fechar.
    #[cfg(desktop)]
    let builder = builder.on_window_event(ao_evento_da_janela);
    builder
        .setup(|app| {
            // O motor nasce antes das janelas: o laço roda com ou sem elas
            // (PLANO.md, 3.2), e o primeiro `get_state` do JS já o encontra.
            let dados = app.path().app_data_dir()?;
            // As configurações antes de tudo: o tema escolhe a cor de fundo e
            // o que o script de inicialização passa à página (4.7), e o
            // `trayTime` vai para a bandeja (M36).
            let store = settings::SettingsStore::load(dados.clone());
            let s = store.get();
            app.manage(store);
            // O banco das estatísticas antes do motor: ele grava os períodos
            // desde a primeira fase (M26).
            let stats = Arc::new(stats::Stats::open(&dados));
            app.manage(stats.clone());
            // A bandeja antes do motor, que a avisa de cada transição; o
            // ícone nasce depois dele, porque o menu fala com o motor (M36).
            let bandeja = Arc::new(tray::Bandeja::new(app.handle().clone(), s.tray_time));
            app.manage(bandeja.clone());
            // v0.3: a procura de atualizações ao abrir, só com a opção ligada.
            #[cfg(desktop)]
            {
                app.manage(update::Atualizador::new(app.handle().clone()));
                if s.auto_update {
                    update::procurar_ao_abrir(app.handle());
                }
            }
            let (clock, speed) = engine::clock_from_env();
            // A thread de som sobe junto: o motor e o `sound_test` usam a mesma,
            // com o volume das configurações (M38).
            #[cfg(desktop)]
            let som = Arc::new(audio::Som::iniciar(s.volume));
            // No Android (A08), a thread só atende o "Testar", pelo plugin.
            #[cfg(target_os = "android")]
            let som = Arc::new(audio::Som::com_saida(audio::pelo_plugin(
                app.handle().clone(),
            )));
            app.manage(som.clone());
            // M37: o "Sair" também grava o `state.json` (`window::sair`).
            let estado = Arc::new(state_file::StateStore::new(&dados));
            // M40: o que estava em andamento quando o app fechou.
            let restaurado = estado.load();
            app.manage(estado.clone());
            // W05: o `Notify` do laço; o `TauriSink` acorda o laço por ele
            // (`Sink::acordar`), e o motor, no `tomatito-motor`, não sabe do
            // tokio.
            let acordador = Arc::new(tokio::sync::Notify::new());
            let motor = Arc::new(engine::Engine::new(
                clock,
                speed,
                engine::TauriSink::new(
                    app.handle().clone(),
                    som,
                    stats,
                    // M33: o `state.json`, gravado a cada transição dos
                    // temporizadores (do cronômetro, M34, e do foco, M40).
                    estado.clone(),
                    bandeja.clone(),
                    acordador.clone(),
                ),
            ));
            // M38: F, B e os sons de fim de fase das configurações; cada
            // `settings_set` os regrava.
            motor.configurar(engine::Preferencias::from(&s));
            // A09: a agenda do Android com as mesmas preferências e a
            // velocidade do motor (sempre 1 no Android, `clock_from_env`).
            #[cfg(target_os = "android")]
            motor
                .sink()
                .configurar_agenda(engine::Preferencias::from(&s), speed);
            // M40: a retomada (`advance_to(now)` com a regra do atraso), antes
            // da bandeja e das janelas; o arquivo passa a ser o do motor.
            motor.restaurar(restaurado);
            estado.save_all(&motor.state());
            // A14: os alarmes do que foi retomado (Android).
            #[cfg(target_os = "android")]
            {
                let retomado = motor.state();
                motor
                    .sink()
                    .retomar_agenda(&retomado.focus, &retomado.timers);
            }
            app.manage(motor.clone());
            bandeja.criar_icone(&motor.state().focus);
            // v0.5: aberto já com `--acao=...` (o menu do ícone com o app
            // fechado): a ação roda assim que o motor existe.
            #[cfg(desktop)]
            if let Some(acao) = acoes::dos_argumentos(&std::env::args().collect::<Vec<_>>()) {
                acoes::executar(app.handle(), acao);
            }
            // v0.5: as tarefas da lista de atalhos da barra de tarefas.
            #[cfg(windows)]
            if let Err(e) = acoes_windows::registrar() {
                eprintln!("[tomatito] lista de atalhos não gravada: {e}");
            }
            tauri::async_runtime::spawn(engine::laco(motor.clone(), acordador));

            // As janelas nascem aqui, e não no tauri.conf.json (PLANO.md, 4.7).
            // Com `theme = full`, só a `tomato`; a `main` nasce sob demanda
            // (5.7, M51). O ouvinte do `tt://tomato-ready` vem antes.
            // M56: o "Sempre na frente" por código (Windows e X11), lido do
            // GDK aqui, na thread principal.
            #[cfg(desktop)]
            {
                window::tomato::detectar_sempre_na_frente();
                window::tomato::ligar(app.handle());
                if s.theme == settings::ThemePref::Full {
                    window::tomato::abrir_no_inicio(app.handle(), &s)?;
                } else {
                    window::main_window::build_main(app.handle(), &s)?;
                }
            }
            // No Android, só a `main`, que ocupa a tela (A03). O tomate em
            // tela cheia é o A16a.
            #[cfg(mobile)]
            window::main_window::build_main(app.handle(), &s)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::app_quit,
            commands::settings_get,
            commands::settings_set,
            commands::focus_start,
            commands::focus_pause,
            commands::focus_resume,
            commands::focus_skip,
            commands::focus_stop,
            commands::sound_test,
            commands::stats_get,
            commands::stats_history,
            commands::task_list,
            commands::task_add,
            commands::task_complete,
            commands::task_delete,
            commands::timer_create,
            commands::timer_update,
            commands::timer_delete,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_reset,
            commands::stopwatch_start,
            commands::stopwatch_pause,
            commands::stopwatch_lap,
            commands::stopwatch_reset,
            anuncio::a11y_announce,
            avisos::notices_read,
            commands::switch_window_mode,
            commands::show_main,
            commands::full_validation_get,
            commands::full_validation_answer,
            commands::set_tomato_region,
            commands::tomato_debug_size,
            commands::tomato_on_top_available,
            compat_x11::x11_compat_get,
            compat_x11::app_restart,
            update::update_info,
            update::update_check,
            update::update_install,
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(ao_evento_do_app);
}

#[cfg(desktop)]
fn ao_evento_da_janela(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window::fechar_para_bandeja(window) {
            api.prevent_close();
        }
        // M56: o tomate fecha; sem "fechar para a bandeja", o app sai.
        window::tomato::fechada_pelo_usuario(window);
    }
    // M54: a `tomato` com outro tamanho pede a região de novo (5.4).
    if let tauri::WindowEvent::Resized(tamanho) = event {
        window::tomato::redimensionada(window, *tamanho);
    }
}

/// M56: sem janela nenhuma (o tomate fechado, sem a `main`), o app fica na
/// bandeja se "fechar para a bandeja" está ligado.
#[cfg(desktop)]
fn ao_evento_do_app(app: &tauri::AppHandle, evento: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested {
        code: None, api, ..
    } = &evento
        && window::manter_na_bandeja(app)
    {
        api.prevent_exit();
    }
}

/// No Android, o ciclo de vida é o da Activity: nada a barrar.
#[cfg(mobile)]
fn ao_evento_do_app(_app: &tauri::AppHandle, _evento: tauri::RunEvent) {}
