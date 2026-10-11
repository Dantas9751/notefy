; Ganchos do instalador NSIS (bundle.windows.nsis.installerHooks).
;
; O backend (notefy-server.exe) pode estar rodando sem janela nenhuma: as
; versões anteriores deixavam o servidor órfão ao fechar o app. Rodando, o
; arquivo fica travado — a atualização não conseguia substituí-lo (e o app
; novo conversava com o backend velho), e a desinstalação deixava o .exe
; para trás.

!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /T /IM notefy-server.exe'
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /T /IM notefy-server.exe'
  Pop $0
!macroend
