@echo off
rem Sobe o Notefy de desenvolvimento com dois cliques: o Django (porta 8000) e
rem o Vite (porta 5173), cada um na sua janela, e abre o navegador.
rem Para parar, feche as duas janelas.
rem Na primeira vez ele mesmo cria o .env, o ambiente do Python e instala os
rem pacotes do frontend.

set "RAIZ=%~dp0"
set "BACK=%RAIZ%backend"
set "FRONT=%RAIZ%frontend"

if not exist "%BACK%\.env" (
  echo Criando backend\.env a partir do exemplo...
  copy "%BACK%\.env.example" "%BACK%\.env" >nul
)

if not exist "%BACK%\.venv\Scripts\python.exe" (
  echo Preparando o Python do backend, so na primeira vez...
  python -m venv "%BACK%\.venv" || goto :erro
  "%BACK%\.venv\Scripts\pip.exe" install -r "%BACK%\requirements.txt" || goto :erro
)

if not exist "%FRONT%\node_modules" (
  echo Instalando os pacotes do frontend, so na primeira vez...
  pushd "%FRONT%"
  call npm install || (popd & goto :erro)
  popd
)

rem `migrate` antes de subir: banco sempre no esquema do codigo.
start "Notefy - servidor (8000)" /d "%BACK%" cmd /k ".venv\Scripts\python.exe manage.py migrate --noinput && .venv\Scripts\python.exe manage.py runserver 8000"
start "Notefy - site (5173)" /d "%FRONT%" cmd /k "npm run dev"

rem Da um tempo para o Vite subir antes de abrir a pagina.
timeout /t 5 /nobreak >nul
start "" http://localhost:5173
exit /b 0

:erro
echo.
echo Algo falhou na preparacao. Veja a mensagem acima.
pause
exit /b 1
