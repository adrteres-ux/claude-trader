# Lanza una ejecucion del agente y guarda el log en agent\logs.
# Lo usa el Programador de tareas: run-agent.ps1 -Slot P0 (08:30) / S0 (09:30) / S1 (16:30) / S2 (21:00) / CLOSE (22:30)
param([Parameter(Mandatory = $true)][ValidateSet("P0", "S0", "S1", "S2", "CLOSE")][string]$Slot)

# El cierre solo tiene sentido despues del cierre de EE. UU. y antes de que abra Europa: si Windows
# lo lanza tarde (PC dormido) a media manana, no se hace nada.
$hour = (Get-Date).Hour
if ($Slot -eq "CLOSE" -and $hour -lt 22 -and $hour -ge 9) { exit 0 }

# Si Windows desperto el PC para esta tarea, lo volveria a suspender a los ~2 minutos.
# Pedimos que no se suspenda mientras dure la ejecucion (como hacen los reproductores de video).
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"
[void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)

try {
  # Al despertar de la suspension el Wi-Fi tarda unos segundos en conectarse: esperamos (max. 2 min)
  # a tener internet antes de empezar. Si no llega, el agente fallara sin reservar la franja.
  for ($i = 0; $i -lt 24; $i++) {
    try { [void][System.Net.Dns]::GetHostAddresses("query1.finance.yahoo.com"); break } catch { Start-Sleep -Seconds 5 }
  }
  $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  Set-Location $repo
  New-Item -ItemType Directory -Force -Path "agent\logs" | Out-Null
  $log = Join-Path $repo ("agent\logs\{0}_{1}.log" -f (Get-Date -Format "yyyy-MM-dd"), $Slot)
  # Actualizacion automatica: descarga los cambios de GitHub antes de cada ejecucion y, si cambian
  # las dependencias, las reinstala. Si falla (sin red, cambios locales) se sigue con la version actual.
  $before = (git rev-parse HEAD 2>$null)
  cmd.exe /c "git pull --ff-only --quiet >> `"$log`" 2>&1"
  $after = (git rev-parse HEAD 2>$null)
  if ($before -and $after -and $before -ne $after) {
    Add-Content -Path $log -Value ("[update] Codigo actualizado de " + $before.Substring(0, 7) + " a " + $after.Substring(0, 7))
    $changed = (git diff --name-only $before $after 2>$null)
    if ($changed -match "package-lock.json") { cmd.exe /c "npm install --no-audit --no-fund >> `"$log`" 2>&1" }
  }
  if ($Slot -eq "CLOSE") {
    cmd.exe /c "npm run close-day >> `"$log`" 2>&1"
    # Cada dia, tras el cierre, la academia revisa por que se gano o se perdio y actualiza el manual.
    # Si el cierre se lanzo de madrugada (antes de las 09:00), revisa el dia anterior.
    $day = if ($hour -lt 9) { (Get-Date).AddDays(-1).ToString("yyyy-MM-dd") } else { (Get-Date).ToString("yyyy-MM-dd") }
    cmd.exe /c "npm run academy -- --day $day >> `"$log`" 2>&1"
  }
  else { cmd.exe /c "npm run run-agent -- --slot $Slot >> `"$log`" 2>&1" }
  $code = $LASTEXITCODE
}
finally {
  [void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS)
}
exit $code
