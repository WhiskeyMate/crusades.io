# Installs the crusades.io game server and Caddy as Windows services.
# Run from an elevated PowerShell in the project folder:
#
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\server\install-windows.ps1 -Hostname play.example.com
#
# What it does:
#   1. builds the server bundle (npm run build:server)
#   2. copies it, Node's dependencies and a Caddyfile to C:\crusades
#   3. downloads NSSM and Caddy if they are not already in C:\crusades\bin
#   4. registers two services, CrusadesServer and CrusadesCaddy, that start
#      with Windows and restart if they crash
#   5. opens TCP 80 and 443 in Windows Firewall (80 only for the
#      certificate challenge; the game itself is on 443)
#
# Re-running it updates the server in place.

param(
    [Parameter(Mandatory = $true)][string]$Hostname,
    [string]$Root = "C:\crusades",
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Need($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd is not installed or not on PATH" }
}
Need node
Need npm

Write-Host "Building the server bundle..."
Push-Location $project
npm run build:server
if ($LASTEXITCODE -ne 0) { throw "build failed" }
Pop-Location

foreach ($d in "$Root", "$Root\bin", "$Root\logs", "$Root\app") {
    New-Item -ItemType Directory -Force $d | Out-Null
}

Write-Host "Copying the server to $Root\app..."
Copy-Item "$project\server\dist\server.mjs" "$Root\app\server.mjs" -Force
# The bundle keeps ws and zod external; give it a tiny package of its own.
$pkg = @{ name = "crusades-server"; private = $true; type = "module"; dependencies = @{} }
foreach ($dep in "ws", "zod") {
    $v = (Get-Content "$project\node_modules\$dep\package.json" | ConvertFrom-Json).version
    $pkg.dependencies[$dep] = $v
}
$pkg | ConvertTo-Json -Depth 3 | Set-Content "$Root\app\package.json" -Encoding utf8
Push-Location "$Root\app"
npm install --omit=dev --no-audit --no-fund | Out-Null
Pop-Location

(Get-Content "$project\server\Caddyfile") -replace "play\.example\.com", $Hostname | Set-Content "$Root\Caddyfile" -Encoding utf8

$nssm = "$Root\bin\nssm.exe"
if (-not (Test-Path $nssm)) {
    Write-Host "Downloading NSSM..."
    $zip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zip
    Expand-Archive $zip "$env:TEMP\nssm" -Force
    Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssm
}
$caddy = "$Root\bin\caddy.exe"
if (-not (Test-Path $caddy)) {
    Write-Host "Downloading Caddy..."
    Invoke-WebRequest "https://caddyserver.com/api/download?os=windows&arch=amd64" -OutFile $caddy
}

function Service($name, $exe, $args, $log) {
    $exists = Get-Service $name -ErrorAction SilentlyContinue
    if ($exists) { & $nssm stop $name | Out-Null; & $nssm remove $name confirm | Out-Null }
    & $nssm install $name $exe $args | Out-Null
    & $nssm set $name AppDirectory "$Root\app" | Out-Null
    & $nssm set $name AppStdout "$Root\logs\$log" | Out-Null
    & $nssm set $name AppStderr "$Root\logs\$log" | Out-Null
    & $nssm set $name AppRotateFiles 1 | Out-Null
    & $nssm set $name AppRotateBytes 10485760 | Out-Null
    & $nssm set $name AppExit Default Restart | Out-Null
    & $nssm set $name AppRestartDelay 3000 | Out-Null
    & $nssm set $name Start SERVICE_AUTO_START | Out-Null
}

$node = (Get-Command node).Source
Service "CrusadesServer" $node "`"$Root\app\server.mjs`"" "server.log"
& $nssm set CrusadesServer AppEnvironmentExtra "PORT=$Port" "HOST=127.0.0.1" | Out-Null
Service "CrusadesCaddy" $caddy "run --config `"$Root\Caddyfile`"" "caddy.log"

Write-Host "Opening the firewall..."
foreach ($p in 80, 443) {
    if (-not (Get-NetFirewallRule -DisplayName "crusades.io $p" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName "crusades.io $p" -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
    }
}

& $nssm start CrusadesServer | Out-Null
& $nssm start CrusadesCaddy | Out-Null
Start-Sleep 2
try {
    $h = Invoke-RestMethod "http://127.0.0.1:$Port/health"
    Write-Host "Game server is up: version $($h.version), $($h.clients) clients."
} catch {
    Write-Warning "The game server did not answer on port $Port. See $Root\logs\server.log"
}
Write-Host ""
Write-Host "Done. The site should be built with VITE_GAME_SERVER=wss://$Hostname"
Write-Host "Logs: $Root\logs    Services: CrusadesServer, CrusadesCaddy (services.msc)"
