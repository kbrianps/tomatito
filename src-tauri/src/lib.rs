mod anuncio;
mod audio;
mod avisos;
mod commands;
mod compat_x11;
mod engine;
mod events;
mod i18n;
mod notify;
mod persist;
mod recursos;
mod settings;
mod state_file;
mod stats;
mod tasks;
mod tray;
mod window;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Um `generate_context!` só: ele embute a página no binário.
    let context = tauri::generate_context!();
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
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::mostrar(app)
        }));
    // O de notificação só existe no Windows; no Linux, o `notify.rs` fala
    // direto com o D-Bus (docs/decisoes.md, M21).
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_notification::init());
    builder
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
            let (clock, speed) = engine::clock_from_env();
            // A thread de som sobe junto: o motor e o `sound_test` usam a mesma,
            // com o volume das configurações (M38).
            let som = Arc::new(audio::Som::iniciar(s.volume));
            app.manage(som.clone());
            // M37: o "Sair" também grava o `state.json` (`window::sair`).
            let estado = Arc::new(state_file::StateStore::new(&dados));
            // M40: o que estava em andamento quando o app fechou.
            let restaurado = estado.load();
            app.manage(estado.clone());
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
                ),
            ));
            // M38: F, B e os sons de fim de fase das configurações; cada
            // `settings_set` os regrava.
            motor.configurar(engine::Preferencias::from(&s));
            // M40: a retomada (`advance_to(now)` com a regra do atraso), antes
            // da bandeja e das janelas; o arquivo passa a ser o do motor.
            motor.restaurar(restaurado);
            estado.save_all(&motor.state());
            app.manage(motor.clone());
            bandeja.criar_icone(&motor.state().focus);
            tauri::async_runtime::spawn(motor.run());

            // As janelas nascem aqui, e não no tauri.conf.json (PLANO.md, 4.7).
            // Com `theme = full`, só a `tomato`; a `main` nasce sob demanda
            // (5.7, M51). O ouvinte do `tt://tomato-ready` vem antes.
            // M56: o "Sempre na frente" por código (Windows e X11), lido do
            // GDK aqui, na thread principal.
            window::tomato::detectar_sempre_na_frente();
            window::tomato::ligar(app.handle());
            if s.theme == settings::ThemePref::Full {
                window::tomato::abrir_no_inicio(app.handle(), &s)?;
            } else {
                window::main_window::build_main(app.handle(), &s)?;
            }
            Ok(())
        })
        // Fechar (X, Ctrl+W, Alt+F4) com "fechar para a bandeja" ligado só
        // esconde a `main` (3.4, M36).
        .on_window_event(|window, event| {
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
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|app, evento| {
            // M56: sem janela nenhuma (o tomate fechado, sem a `main`), o app
            // fica na bandeja se "fechar para a bandeja" está ligado.
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = &evento
                && window::manter_na_bandeja(app)
            {
                api.prevent_exit();
            }
        });
}
