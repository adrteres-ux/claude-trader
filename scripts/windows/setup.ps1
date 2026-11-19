# Instalacion completa en un PC con Windows (una sola vez).
# Uso, desde la carpeta del repo:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
# Hace: Claude Code, dependencias, .env.local (pide la clave secreta), inicio de sesion en Claude,
# tests, prueba sin conexion y tareas programadas. Se puede volver a ejecutar sin romper nada.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo

function Step($n, $text) { Write-Host ""; Write-Host "=== Paso $n de 7: $text ===" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host "ERROR: $text" -ForegroundColor Red; Write-Host "Copia todo lo que ves en pantalla y pegaselo a Claude."; Read-Host "Pulsa Enter para salir"; exit 1 }

# Permite ejecutar npm en futuras ventanas de PowerShell.
try { Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force } catch { }

Step 1 "Comprobar Node y Git"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "No se encuentra Node.js. Instala con: winget install -e --id OpenJS.NodeJS.LTS  y abre una ventana nueva." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "No se encuentra Git. Instala con: winget install -e --id Git.Git  y abre una ventana nueva." }
Write-Host ("Node " + (node -v) + " y " + (git --version) + " OK") -ForegroundColor Green

Step 2 "Instalar Claude Code"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  cmd.exe /c "npm install -g @anthropic-ai/claude-code"
  if ($LASTEXITCODE -ne 0) { Fail "No se pudo instalar Claude Code." }
  $env:Path = $env:Path + ";" + (Join-Path $env:APPDATA "npm")
}
Write-Host "Claude Code OK" -ForegroundColor Green

Step 3 "Instalar las dependencias del proyecto (tarda 1-3 minutos)"
cmd.exe /c "npm install --no-audit --no-fund"
if ($LASTEXITCODE -ne 0) { Fail "npm install ha fallado." }

Step 4 "Configurar las claves (.env.local)"
$envFile = Join-Path $repo ".env.local"
$needKey = $true
if (Test-Path $envFile) {
  $current = [IO.File]::ReadAllText($envFile)
  if ($current -match "(?m)^SUPABASE_SECRET_KEY=sb_secret_\S+") { $needKey = $false; Write-Host ".env.local ya tiene la clave secreta." -ForegroundColor Green }
}
if ($needKey) {
  Write-Host "Abre https://supabase.com/dashboard -> proyecto simulador-bolsa -> Project Settings -> API Keys -> Secret keys"
  Write-Host "Copia la clave que empieza por sb_secret_ (boton de copiar) y pegala aqui (clic derecho pega)."
  $key = ""
  while (-not $key.StartsWith("sb_secret_")) {
    $key = (Read-Host "Clave secreta").Trim()
    if (-not $key.StartsWith("sb_secret_")) { Write-Host "Debe empezar por sb_secret_. Prueba otra vez." -ForegroundColor Yellow }
  }
  $example = [IO.File]::ReadAllText((Join-Path $repo ".env.example"))
  $content = $example -replace "(?m)^SUPABASE_SECRET_KEY=.*$", ("SUPABASE_SECRET_KEY=" + $key)
  [IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ".env.local creado." -ForegroundColor Green
}

Step 5 "Iniciar sesion en Claude (solo la primera vez)"
$probe = cmd.exe /c "claude -p ""Responde solo: ok"" 2>&1"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Se va a abrir Claude Code. Sigue los pasos para iniciar sesion con tu cuenta de Claude en el navegador."
  Write-Host "Cuando veas el cuadro para escribir, escribe /exit y pulsa Enter para volver aqui."
  Read-Host "Pulsa Enter para empezar"
  claude
  $probe = cmd.exe /c "claude -p ""Responde solo: ok"" 2>&1"
  if ($LASTEXITCODE -ne 0) { Fail ("Claude no responde: " + $probe) }
}
Write-Host "Claude responde OK" -ForegroundColor Green

Step 6 "Comprobar el motor, los datos y una decision de prueba (sin guardar nada)"
cmd.exe /c "npm test"
if ($LASTEXITCODE -ne 0) { Fail "Los tests del motor han fallado." }
cmd.exe /c "npm run market-check"
if ($LASTEXITCODE -ne 0) { Fail "No se pudieron leer los datos de Yahoo Finance." }
cmd.exe /c "npm run run-agent -- --dry-run --force"
if ($LASTEXITCODE -ne 0) { Fail "La ejecucion de prueba ha fallado." }

Step 7 "Programar las ejecuciones automaticas (L-V 08:30, 09:30, 16:30, 21:00 y cierre 22:30)"
& (Join-Path $PSScriptRoot "install-tasks.ps1")

Write-Host ""
Write-Host "TODO LISTO. El agente se ejecutara solo de lunes a viernes." -ForegroundColor Green
Write-Host "Deja el PC encendido o en suspension (no apagado). Los registros quedan en agent\logs."
Read-Host "Pulsa Enter para cerrar"
