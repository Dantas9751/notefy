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

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::DialogExt;
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

/// Desfaz o percent-encoding do nome do arquivo.
///
/// O nome viaja num cabeçalho HTTP do IPC, e cabeçalho só aceita ASCII —
/// mas os nomes aqui são de gente que escreve em português ("Relatório
/// anual.pdf"). O JavaScript manda `encodeURIComponent`, e o que volta ao
/// byte original é isto.
fn decodificar_nome(texto: &str) -> String {
    let bytes = texto.as_bytes();
    let mut saida = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&texto[i + 1..i + 3], 16) {
                saida.push(byte);
                i += 3;
                continue;
            }
        }
        saida.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&saida).into_owned()
}

/// Nome legível do formato para a lista de tipos do "Salvar como".
///
/// O que aparece ali é "Documento PDF (*.pdf)", e não "PDF (*.pdf)" — o
/// diálogo do Windows monta o "(*.ext)" sozinho a partir do filtro.
fn rotulo_do_formato(extensao: &str) -> &str {
    match extensao {
        "pdf" => "Documento PDF",
        "md" => "Markdown",
        "html" => "Página HTML",
        "csv" => "Valores separados por vírgula",
        "xlsx" => "Planilha do Excel",
        "json" => "JSON",
        "svg" => "Imagem SVG",
        "png" => "Imagem PNG",
        "jpg" | "jpeg" => "Imagem JPEG",
        "gif" => "Imagem GIF",
        "webp" => "Imagem WebP",
        "zip" => "Arquivo ZIP",
        "mp3" => "Áudio MP3",
        "mp4" => "Vídeo MP4",
        "docx" => "Documento do Word",
        "pptx" => "Apresentação do PowerPoint",
        "txt" => "Texto",
        // Formato que a lista não conhece ainda: o diálogo mostra a
        // extensão mesmo, que é melhor do que um rótulo genérico errado.
        _ => "Arquivo",
    }
}

/// Pergunta onde salvar e grava os bytes ali.
///
/// A webview não tem gerenciador de downloads: um `<a download>` clicado
/// por script não faz nada e não avisa nada. Exportar e baixar arquivo
/// passam por aqui.
///
/// O conteúdo chega como corpo bruto do IPC, não como argumento JSON. Um
/// `Vec<u8>` serializado em JSON vira uma lista de números — cerca de
/// quatro vezes o tamanho original, o que um arquivo de dezenas de MB não
/// sobrevive. O nome vai num cabeçalho porque corpo bruto não convive com
/// argumentos nomeados.
///
/// Devolve o caminho escolhido, ou `None` se a pessoa cancelou — cancelar
/// não é erro, e a interface precisa saber diferenciar para não mostrar
/// "falha ao exportar" para quem só desistiu.
#[tauri::command]
async fn salvar_arquivo(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(dados) = request.body() else {
        return Err("o conteúdo do arquivo precisa vir como corpo bruto".into());
    };

    let nome = request
        .headers()
        .get("x-nome")
        .and_then(|valor| valor.to_str().ok())
        .map(decodificar_nome)
        .unwrap_or_else(|| "arquivo".to_string());

    // Nome e extensão vão em campos separados: o "Salvar como" espera o
    // nome sem extensão no campo de texto e a extensão na lista de baixo.
    // Mandar "briar.png" inteiro no nome deixava o tipo como "All Files",
    // e quem trocasse o nome perdia a extensão junto.
    let (base, extensao) = match nome.rsplit_once('.') {
        Some((b, e)) if !b.is_empty() && !e.is_empty() => (b, Some(e.to_lowercase())),
        _ => (nome.as_str(), None),
    };

    let mut dialogo = app.dialog().file().set_file_name(base);

    if let Some(ext) = &extensao {
        dialogo = dialogo.add_filter(rotulo_do_formato(ext), &[ext.as_str()]);
    }
    // Escape para quem quiser gravar com outro nome ou sem extensão.
    dialogo = dialogo.add_filter("Todos os arquivos", &["*"]);

    let escolhido = dialogo.blocking_save_file();

    let Some(destino) = escolhido else {
        return Ok(None);
    };

    let caminho = destino.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&caminho, dados).map_err(|e| e.to_string())?;

    Ok(Some(caminho.display().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![salvar_arquivo])
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
