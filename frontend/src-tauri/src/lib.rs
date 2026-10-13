//! Notefy Desktop — a janela e o backend que vive dentro dela.
//!
//! O Notefy é um app headless: um servidor Django e uma SPA React que
//! conversa com ele por HTTP. Para virar um programa que se instala com
//! dois cliques, o servidor vem junto, empacotado como um executável
//! (o "sidecar"), e este processo é quem o liga e desliga.
//!
//! O ciclo é: subir o backend e abrir a janela na hora; a SPA pergunta
//! `esperar_backend` antes do primeiro pedido. Esperar importa — ela pede
//! `/api/me/` no primeiro instante, e sem a espera mostraria erro de
//! conexão (ou perderia a sessão) para um usuário que não tem o que fazer a
//! respeito. Mas a espera é dela, e não da janela: esperar aqui travava a
//! janela inteira.

#[cfg(desktop)]
mod midia;

use std::net::TcpStream;
#[cfg(desktop)]
use std::time::{Duration, Instant};

use tauri::AppHandle;
#[cfg(desktop)]
use tauri::{Manager, RunEvent};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;
#[cfg(desktop)]
use std::process::{Child, Command, Stdio};

/// Mesma porta gravada no `desktop_server.py` e compilada no frontend.
#[cfg(desktop)]
const BACKEND_ADDR: &str = "127.0.0.1:8756";

/// Teto para o primeiro arranque: o Django carrega todos os apps e roda as
/// migrations pendentes antes de abrir a porta, e num disco lento (ou logo
/// depois de atualizar) isso demora.
#[cfg(desktop)]
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// Guarda o processo do backend para poder encerrá-lo quando o app fechar.
#[cfg(desktop)]
struct Backend(std::sync::Mutex<Option<Child>>);

/// Sobe o backend: o executável dentro de `backend/`, nos recursos do app.
///
/// É uma pasta (PyInstaller `onedir`), e não um sidecar de arquivo único: o
/// arquivo único se descompactava no Temp a cada abertura — 4.700 arquivos,
/// uns 14 s — e, encerrado à força, deixava a pasta para trás.
#[cfg(desktop)]
fn iniciar_backend(app: &tauri::App) -> std::io::Result<Child> {
    let pasta = app.path().resource_dir().map_err(std::io::Error::other)?.join("backend");
    let exe = if cfg!(windows) { "notefy-server.exe" } else { "notefy-server" };
    Command::new(pasta.join(exe))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

/// Encerra o backend e o que ele tiver aberto.
///
/// Pela árvore, e não só o processo: no tempo do arquivo único o servidor
/// de verdade era um neto, que o `kill()` não alcançava — ficava órfão,
/// segurando a porta e o próprio `notefy-server.exe`.
#[cfg(desktop)]
fn encerrar_backend(mut child: Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Sem piscar uma janela de console ao fechar o app.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Espera a porta aceitar conexão — é o sinal de que o Django está pronto.
#[cfg(desktop)]
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

/// Responde quando o backend aceitar conexão (`false` se desistir no tempo-limite).
///
/// A janela abre na hora, com a abertura animada, e a SPA pergunta isto
/// antes do primeiro pedido. Esperar dentro do `setup` travava a thread da
/// janela: o Windows a dava como "Não respondendo" e a animação pulava
/// para o fim.
#[cfg(desktop)]
#[tauri::command]
async fn esperar_backend() -> bool {
    tauri::async_runtime::spawn_blocking(wait_for_backend).await.unwrap_or(false)
}

/// No celular não há backend embutido: a SPA fala com o servidor na nuvem.
#[cfg(not(desktop))]
#[tauri::command]
async fn esperar_backend() -> bool {
    true
}

/// Desfaz o percent-encoding do nome do arquivo.
///
/// O nome viaja num cabeçalho HTTP do IPC, e cabeçalho só aceita ASCII —
/// mas os nomes aqui são de gente que escreve em português ("Relatório
/// anual.pdf"). O JavaScript manda `encodeURIComponent`, e o que volta ao
/// byte original é isto.
#[cfg(desktop)]
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
#[cfg(desktop)]
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
#[cfg(desktop)]
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

/// Abre o explorador de arquivos com o arquivo recém-exportado selecionado:
/// o aviso "Salvo em..." vira um atalho para onde ele foi parar.
///
/// Só caminho de ARQUIVO que existe: a SPA não abre pasta nem programa
/// qualquer por aqui.
#[cfg(desktop)]
#[tauri::command]
fn mostrar_na_pasta(caminho: String) -> Result<(), String> {
    let arquivo = std::path::Path::new(&caminho);
    if !arquivo.is_file() {
        return Err("arquivo não encontrado".into());
    }
    #[cfg(windows)]
    let resultado = {
        use std::os::windows::process::CommandExt;
        // `raw_arg`: o explorer quer `/select,"C:\caminho"` numa peça só, e o
        // escape padrão do Rust envolveria a vírgula junto nas aspas.
        std::process::Command::new("explorer").raw_arg(format!("/select,\"{}\"", caminho)).spawn()
    };
    #[cfg(target_os = "macos")]
    let resultado = std::process::Command::new("open").arg("-R").arg(arquivo).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let resultado = std::process::Command::new("xdg-open")
        .arg(arquivo.parent().unwrap_or(arquivo))
        .spawn();
    resultado.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(mobile)]
#[tauri::command]
fn mostrar_na_pasta(_caminho: String) -> Result<(), String> {
    Err("não disponível no Android".into())
}

/// No celular o "Salvar como" do sistema não é um diálogo que o Rust abre:
/// exportar precisa do compartilhamento nativo do Android, que ainda não foi
/// ligado. A SPA já trata o erro e mostra a mensagem em vez de fingir que
/// gravou.
#[cfg(mobile)]
#[tauri::command]
async fn salvar_arquivo(_app: AppHandle, _request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    Err("exportar arquivos ainda não é suportado no Android".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let construtor = tauri::Builder::default();

    // O backend empacotado só existe no desktop.
    // Precisa ser o PRIMEIRO plugin: a segunda instância encerra aqui, antes
    // de subir outro backend, e só traz a janela que já está aberta.
    #[cfg(desktop)]
    let construtor = construtor
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(janela) = app.get_webview_window("main") {
                let _ = janela.unminimize();
                let _ = janela.show();
                let _ = janela.set_focus();
            }
        }))
        // Reabre onde estava: posição, tamanho, monitor e maximizada. Só a
        // principal (as destacadas têm rótulo novo a cada vez), e sem o
        // "visível": quem mostra é o `setup`, já com a janela no lugar.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE
                        - tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .with_filter(|rotulo| rotulo == "main")
                .build(),
        )
        .manage(Backend(std::sync::Mutex::new(None)));

    construtor
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![esperar_backend, salvar_arquivo, mostrar_na_pasta, midia::midia_atual, midia::midia_comando])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Sobe o backend sem esperar a porta: a SPA espera por conta
            // própria (`esperar_backend`) enquanto a abertura anima.
            //
            // A janela nasce escondida e quem a mostra é a SPA, já desenhada:
            // mostrada aqui, ela piscava o branco do WebView antes da página.
            // Se a SPA não mostrar (falhou ao carregar), mostra assim mesmo.
            #[cfg(desktop)]
            {
                let child = iniciar_backend(app).expect("não foi possível iniciar o backend do Notefy");
                app.state::<Backend>().0.lock().unwrap().replace(child);
                if let Some(janela) = app.get_webview_window("main") {
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(4));
                        if !janela.is_visible().unwrap_or(true) {
                            let _ = janela.show();
                        }
                    });
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao construir o aplicativo")
        .run(|_app, _event| {
            // Sair do app precisa levar o servidor junto: um processo órfão
            // continuaria segurando a porta e o banco, e a próxima abertura
            // falharia sem explicação. Só ao sair de fato, e não ao fechar
            // uma janela qualquer: fechar uma janela extra (item aberto à
            // parte) derrubava o backend da janela principal.
            #[cfg(desktop)]
            if matches!(_event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(child) = _app.state::<Backend>().0.lock().unwrap().take() {
                    encerrar_backend(child);
                }
            }
        });
}
