//! Notefy Desktop — a janela e o backend que vive dentro dela.
//!
//! O Notefy é um app headless: um servidor Django e uma SPA React que
//! conversa com ele por HTTP. Para virar um programa que se instala com
//! dois cliques, o servidor vem junto, empacotado como um executável
//! (o "sidecar"), e este processo é quem o liga e desliga.
//!
//! O ciclo é: subir o sidecar, esperar a porta responder, abrir a janela.
//! Esperar importa — a SPA pede `/api/me/` no primeiro instante, e uma
//! janela aberta antes do servidor mostraria um erro de conexão para um
//! usuário que não tem o que fazer a respeito.

use std::net::TcpStream;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Mesma porta gravada no `desktop_server.py` e compilada no frontend.
const BACKEND_ADDR: &str = "127.0.0.1:8756";

/// Teto para o primeiro arranque. O executável do backend se descompacta
/// antes de subir, e num disco lento isso passa de dez segundos.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// Guarda o processo filho para poder encerrá-lo quando o app fechar.
struct Backend(std::sync::Mutex<Option<CommandChild>>);

/// Espera a porta aceitar conexão — é o sinal de que o Django está pronto.
fn wait_for_backend() -> bool {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if TcpStream::connect(BACKEND_ADDR).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Backend(std::sync::Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let (_rx, child) = app
                .shell()
                .sidecar("notefy-server")
                .expect("o executável do backend não foi encontrado no pacote")
                .spawn()
                .expect("não foi possível iniciar o backend do Notefy");

            app.state::<Backend>().0.lock().unwrap().replace(child);

            if !wait_for_backend() {
                // A janela abre mesmo assim: a SPA já sabe mostrar erro de
                // conexão e oferecer "tentar de novo", o que é melhor do
                // que um app que não abre.
                eprintln!("Notefy: o backend não respondeu a tempo em {BACKEND_ADDR}");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao construir o aplicativo")
        .run(|app, event| {
            // Fechar a janela precisa levar o servidor junto: um processo
            // órfão continuaria segurando a porta e o banco, e a próxima
            // abertura falharia sem explicação.
            let encerrar = matches!(
                event,
                RunEvent::ExitRequested { .. } | RunEvent::WindowEvent { event: WindowEvent::Destroyed, .. }
            );

            if encerrar {
                if let Some(child) = app.state::<Backend>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
