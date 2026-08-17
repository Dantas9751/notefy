# Cria (ou reaproveita) o certificado autoassinado que assina o Notefy.
#
#   powershell -ExecutionPolicy Bypass -File criar-certificado.ps1
#
# O certificado fica no armazenamento pessoal do usuario (Cert:\CurrentUser\My).
# O script imprime o thumbprint, que e o valor de
# bundle.windows.certificateThumbprint no tauri.conf.json.
#
# O QUE ESTE CERTIFICADO FAZ, E O QUE NAO FAZ:
#
#   Faz  - o instalador passa a ter um publicador ("Notefy") em vez de
#          "Publicador desconhecido", e o Windows consegue verificar que o
#          arquivo nao foi adulterado depois de assinado.
#
#   NAO  - nao elimina o aviso do SmartScreen em outro computador. Um
#          certificado autoassinado so e confiavel onde ele foi instalado
#          como confiavel. Para o aviso sumir para qualquer pessoa seria
#          preciso um certificado de uma autoridade certificadora (paga).
#
# Sem acentos de proposito: o PowerShell 5.1 le .ps1 como ANSI, e qualquer
# caractere fora do ASCII quebra o parser antes de executar.

$ErrorActionPreference = "Stop"

$assunto = "CN=Notefy, O=Notefy, C=BR"

$existente = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $assunto -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1

if ($existente) {
    Write-Host "Certificado ja existe." -ForegroundColor Green
    $cert = $existente
} else {
    Write-Host "Criando certificado..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $assunto `
        -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(5) `
        -KeyUsage DigitalSignature `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
}

Write-Host ""
Write-Host "Thumbprint : $($cert.Thumbprint)"
Write-Host "Assunto    : $($cert.Subject)"
Write-Host "Valido ate : $($cert.NotAfter)"
Write-Host ""
Write-Host "Coloque o thumbprint em frontend/src-tauri/tauri.conf.json:"
Write-Host '  "windows": { "certificateThumbprint": "' -NoNewline
Write-Host $cert.Thumbprint -NoNewline -ForegroundColor Yellow
Write-Host '" }'

# Exporta a parte publica para quem quiser marcar o publicador como confiavel
# nesta maquina. So a chave publica: a privada continua no armazenamento.
$cer = Join-Path $PSScriptRoot "notefy-publicador.cer"
Export-Certificate -Cert $cert -FilePath $cer -Force | Out-Null
Write-Host ""
Write-Host "Chave publica exportada em:" -ForegroundColor Green
Write-Host "  $cer"
Write-Host ""
Write-Host "Para confiar neste publicador NESTA maquina (opcional, pede admin):"
Write-Host "  Import-Certificate -FilePath '$cer' -CertStoreLocation Cert:\LocalMachine\TrustedPublisher"
Write-Host ""
Write-Host "Isso altera uma configuracao de seguranca do Windows. Rode voce"
Write-Host "mesmo, so se entender e quiser o efeito."
