//! A música que está tocando no computador, para o bloco do relógio no Início.
//!
//! No Windows é o mesmo controle de mídia do sistema que aparece no volume e
//! na tela de bloqueio (SMTC): vale para Spotify, navegador, player do Windows.
//! Fora do Windows não há o que ler, e o bloco mostra só a hora.

use serde::Serialize;

#[derive(Serialize)]
pub struct Midia {
    titulo: String,
    artista: String,
    app: String,
    tocando: bool,
}

#[cfg(windows)]
mod sistema {
    use super::Midia;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Sessao,
        GlobalSystemMediaTransportControlsSessionManager as Gerenciador,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Estado,
    };

    /// A sessão que o Windows considera atual; nenhuma quando nada toca.
    fn sessao() -> windows::core::Result<Option<Sessao>> {
        let gerenciador = Gerenciador::RequestAsync()?.get()?;
        Ok(gerenciador.GetCurrentSession().ok())
    }

    pub fn atual() -> windows::core::Result<Option<Midia>> {
        let Some(sessao) = sessao()? else { return Ok(None) };
        let propriedades = sessao.TryGetMediaPropertiesAsync()?.get()?;
        let tocando = sessao.GetPlaybackInfo()?.PlaybackStatus()? == Estado::Playing;
        let app = super::nome_do_app(&sessao.SourceAppUserModelId()?.to_string());
        Ok(Some(Midia {
            titulo: propriedades.Title()?.to_string(),
            artista: propriedades.Artist()?.to_string(),
            app,
            tocando,
        }))
    }

    pub fn comando(acao: &str) -> windows::core::Result<bool> {
        let Some(sessao) = sessao()? else { return Ok(false) };
        match acao {
            "tocar" => sessao.TryTogglePlayPauseAsync()?.get(),
            "proxima" => sessao.TrySkipNextAsync()?.get(),
            "anterior" => sessao.TrySkipPreviousAsync()?.get(),
            _ => Ok(false),
        }
    }
}

/// Nome legível do app a partir do id que o Windows dá à sessão: "Spotify.exe",
/// "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic",
/// "com.riotgames.RiotClient". O que vale é o último pedaço com nome.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn nome_do_app(id: &str) -> String {
    let id = id.split('!').next().unwrap_or(id);
    let id = id.split('_').next().unwrap_or(id);
    let id = id.strip_suffix(".exe").unwrap_or(id);
    id.rsplit('.').next().unwrap_or(id).to_string()
}

#[cfg(test)]
mod testes {
    use super::nome_do_app;

    #[test]
    fn nome_do_app_pega_o_ultimo_pedaco_com_nome() {
        assert_eq!(nome_do_app("Spotify.exe"), "Spotify");
        assert_eq!(nome_do_app("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "ZuneMusic");
        assert_eq!(nome_do_app("com.riotgames.RiotClient"), "RiotClient");
        assert_eq!(nome_do_app("chrome"), "chrome");
    }
}

/// O que está tocando agora, ou `None`. Fora da thread da janela: as
/// chamadas do Windows aqui esperam a resposta do sistema.
#[tauri::command]
pub async fn midia_atual() -> Result<Option<Midia>, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| sistema::atual().map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

/// `tocar` (alterna tocar/pausar), `proxima` ou `anterior`.
#[tauri::command]
pub async fn midia_comando(acao: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || sistema::comando(&acao).map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = acao;
        Ok(false)
    }
}
