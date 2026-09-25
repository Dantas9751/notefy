# Gera o instalador do Notefy para Windows.
#
#   powershell -ExecutionPolicy Bypass -File build-desktop.ps1
#
# Sao quatro etapas: empacotar o backend Django num executavel, coloca-lo
# assinado onde o Tauri espera o sidecar, compilar o aplicativo e empacotar
# os instaladores, que sao assinados no fim. O frontend e compilado pelo
# proprio Tauri (beforeBuildCommand), no modo "desktop", que aponta a API
# para o backend embutido em vez do proxy do Vite.
#
# Sem acentos de proposito: o PowerShell 5.1 le arquivos .ps1 como ANSI, e
# qualquer caractere fora do ASCII quebra o parser antes de executar.

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot

# O Cargo nao esta no PATH do sistema; o rustup foi instalado com
# --no-modify-path para nao mexer no ambiente do usuario.
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

# ---------------------------------------------------------------------
# Linker
#
# Quem linka depende da toolchain do Rust, e as duas circulam por ai: a
# "gnu" usa o MinGW, a "msvc" usa o link.exe do Visual Studio. Assumir
# uma das duas quebra na maquina que tem a outra, com um erro que nao
# diz o que aconteceu ("linker `link.exe` not found"), entao perguntamos
# ao proprio rustc.
# ---------------------------------------------------------------------
$alvo = (rustc -vV | Select-String "^host:").ToString().Split(" ")[1]
Write-Host "Toolchain do Rust: $alvo" -ForegroundColor DarkGray

if ($alvo -like "*-gnu") {
    $mingw = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
    if (-not (Test-Path $mingw)) {
        throw "toolchain gnu, mas o MinGW nao esta em $mingw"
    }
    $env:PATH = "$mingw;$env:PATH"
} else {
    # O vcvars64.bat nao exporta so o PATH: sao dezenas de variaveis
    # (INCLUDE, LIB, WindowsSdkDir...) que o link.exe precisa. Rodar em
    # cmd e reimportar o ambiente inteiro e a unica forma de trazer tudo
    # para esta sessao. Fazer so o PATH deixa o link.exe sem as libs.
    $raizesVs = @("$env:ProgramFiles\Microsoft Visual Studio", "${env:ProgramFiles(x86)}\Microsoft Visual Studio")
    $vcvars = Get-ChildItem $raizesVs -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue } |
        ForEach-Object { Join-Path $_.FullName "VC\Auxiliary\Build\vcvars64.bat" } |
        Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $vcvars) {
        throw "toolchain msvc, mas o vcvars64.bat nao foi encontrado - instale as Build Tools do Visual Studio (workload 'Desenvolvimento para desktop com C++')"
    }

    Write-Host "Ambiente MSVC: $vcvars" -ForegroundColor DarkGray
    cmd /c "`"$vcvars`" >nul 2>&1 && set" | ForEach-Object {
        if ($_ -match "^([^=]+)=(.*)$") {
            Set-Item -Path "Env:\$($matches[1])" -Value $matches[2]
        }
    }
}

# ---------------------------------------------------------------------
# Assinatura
#
# O Tauri assina chamando signtool.exe, mas o procura pelo registro do
# Windows (HKLM\...\Windows Kits\Installed Roots), nao pelo PATH. Escrever
# nesse registro exige admin e mexe na configuracao da maquina, entao a
# assinatura fica por nossa conta: o Set-AuthenticodeSignature do proprio
# PowerShell faz Authenticode sem depender do SDK.
#
# Compilar e empacotar ficam separados (tauri build --no-bundle e depois
# tauri bundle) para que a assinatura dos instaladores seja um passo nosso,
# no fim, e nao uma etapa escondida dentro do bundler.
# ---------------------------------------------------------------------
$assunto = "CN=Notefy, O=Notefy, C=BR"
$cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $assunto -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1

if (-not $cert) {
    Write-Warning "certificado nao encontrado - rode criar-certificado.ps1. Seguindo SEM assinar."
}

function Assinar($caminho) {
    if (-not $cert) { return }
    if (-not (Test-Path $caminho)) { return }

    # Um executavel recem-gravado costuma estar preso pelo antivirus, que
    # varre os 50 MB antes de soltar. Sem esta espera o build morria com
    # "o arquivo esta sendo usado por outro processo".
    for ($i = 0; $i -lt 15; $i++) {
        try {
            $fs = [IO.File]::Open($caminho, 'Open', 'ReadWrite', 'None')
            $fs.Close()
            break
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    # Assina UMA vez so. A tentacao aqui e olhar o Status e reassinar
    # quando ele nao for "Valid", mas isso esta errado: um certificado
    # autoassinado SEMPRE reporta "UnknownError", porque a raiz nao e
    # confiavel nesta maquina, e nao porque a assinatura falhou. Reassinar
    # por causa disso so descartava o carimbo de tempo da primeira vez.
    #
    # O carimbo de tempo mantem a assinatura valida depois que o
    # certificado expirar; sem rede, assina sem ele em vez de derrubar o
    # build inteiro.
    try {
        $r = Set-AuthenticodeSignature -FilePath $caminho -Certificate $cert `
            -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com" -ErrorAction Stop
    } catch {
        $r = Set-AuthenticodeSignature -FilePath $caminho -Certificate $cert -HashAlgorithm SHA256
    }

    # "UnknownError" com assinante preenchido = assinado, raiz nao confiavel.
    $rotulo = if ($r.SignerCertificate) { "assinado" } else { "FALHOU" }
    Write-Host ("    {0}: {1} [{2}]" -f $rotulo, (Split-Path $caminho -Leaf), $r.Status)
}

# Compilar dentro de Downloads faz o App Control do Windows barrar os build
# scripts do Cargo; fora dali, nao.
$env:CARGO_TARGET_DIR = "$env:LOCALAPPDATA\notefy-target"

Write-Host ""
Write-Host "[1/4] Empacotando o backend..." -ForegroundColor Cyan
Push-Location "$raiz\backend"
& ".\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean notefy-server.spec
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "falha ao empacotar o backend" }
Pop-Location

Write-Host ""
Write-Host "[2/4] Instalando o backend como sidecar..." -ForegroundColor Cyan
$destino = "$raiz\frontend\src-tauri\binaries"
New-Item -ItemType Directory -Force $destino | Out-Null

# O Tauri procura o sidecar pelo nome com sufixo do alvo de compilacao.
# No Windows ele assume "msvc" mesmo quando a toolchain do Rust e a "gnu",
# entao gravamos os dois nomes: o binario e o mesmo (vem do PyInstaller e
# nao tem relacao com o alvo do Rust), so o nome que o bundler procura muda.
# ($alvo ja veio la de cima, junto da escolha do linker.)

# Assina o original UMA vez e so entao copia: as duas copias saem prontas
# e assinadas. Assinar cada copia separadamente significaria esperar o
# antivirus liberar um arquivo de 50 MB duas vezes, e foi o que derrubava
# o build.
Write-Host "    assinando o backend..."
Assinar "$raiz\backend\dist\notefy-server.exe"

# Na toolchain msvc os dois nomes coincidem; o -Unique evita copiar o
# mesmo arquivo de 50 MB duas vezes.
foreach ($sufixo in (@($alvo, "x86_64-pc-windows-msvc") | Select-Object -Unique)) {
    Copy-Item "$raiz\backend\dist\notefy-server.exe" "$destino\notefy-server-$sufixo.exe" -Force
    Write-Host "    -> notefy-server-$sufixo.exe"
}

# A toolchain MSVC embute o WebView2Loader no executavel; a GNU o deixa
# como DLL externa. Sem ela ao lado do .exe, o app nem abre na maquina de
# quem instala (erro 0xC0000135, DLL nao encontrada). O tauri.conf.json a
# declara como recurso obrigatorio, entao ela precisa existir aqui nos
# dois casos, ou o bundler para.
#
# A DLL vem dentro do codigo-fonte do crate webview2-com-sys, e nao de
# nenhum passo de compilacao: procurar em CARGO_TARGET_DIR primeiro nunca
# achava nada num build limpo, porque essa pasta so existe depois de
# compilar - e a compilacao vem so na etapa seguinte. O cargo fetch baixa
# o codigo dos crates sem compilar, que e exatamente o que falta aqui.
Push-Location "$raiz\frontend\src-tauri"
cargo fetch --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "falha ao baixar os crates" }
Pop-Location

$loader = Get-ChildItem "$env:USERPROFILE\.cargo\registry\src" -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -like "*x64*" } | Select-Object -First 1
if ($loader) {
    Copy-Item $loader.FullName "$destino\WebView2Loader.dll" -Force
    Write-Host "    -> WebView2Loader.dll"
} else {
    throw "WebView2Loader.dll nao encontrada - o app nao abriria sem ela"
}

Write-Host ""
Write-Host "[3/4] Compilando o aplicativo..." -ForegroundColor Cyan
Push-Location "$raiz\frontend"
npx tauri build --no-bundle
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "falha ao compilar o Tauri" }
Pop-Location

# O notefy.exe NAO e assinado aqui, e nao e esquecimento: na etapa
# seguinte o proprio Tauri reescreve o binario ("Patching notefy.exe with
# bundle type information") para marcar se ele veio do msi ou do nsis.
# Qualquer assinatura feita antes disso quebra, e um arquivo com
# assinatura invalida (HashMismatch) e pior do que um sem assinatura
# nenhuma: o Windows passa a acusar arquivo adulterado. Quem carrega a
# identidade do publicador sao os instaladores, assinados no fim.

Write-Host ""
Write-Host "[4/4] Empacotando os instaladores..." -ForegroundColor Cyan
Push-Location "$raiz\frontend"
npx tauri bundle
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "falha ao empacotar o Tauri" }
Pop-Location

Write-Host ""
Write-Host "Assinando os instaladores..." -ForegroundColor Cyan
Get-ChildItem "$env:CARGO_TARGET_DIR\release\bundle" -Recurse -Include "*.msi", "*.exe" -ErrorAction SilentlyContinue |
    ForEach-Object { Assinar $_.FullName }

$instaladores = Get-ChildItem "$env:CARGO_TARGET_DIR\release\bundle" -Recurse -Include "*.msi", "*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

Write-Host ""
if ($instaladores) {
    Write-Host "Instaladores gerados:" -ForegroundColor Green
    foreach ($arq in $instaladores) {
        $assinatura = (Get-AuthenticodeSignature $arq.FullName).Status
        Write-Host ("  {0}" -f $arq.FullName)
        Write-Host ("    {0:N1} MB   assinatura: {1}" -f ($arq.Length / 1MB), $assinatura)
    }
} else {
    Write-Warning "build terminou sem produzir instalador - verifique a saida acima"
}
