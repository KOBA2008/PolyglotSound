# Lance PolyglotSound sous Windows : backend (8000) + frontend (5173), chacun dans sa fenêtre.
# Usage : powershell -ExecutionPolicy Bypass -File start.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root "backend\.env.example") $envFile }

# ffmpeg installé par winget (Gyan.FFmpeg), si absent du PATH
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    $ff = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ff) { $env:PATH = "$env:PATH;$($ff.FullName)" } else { Write-Warning "ffmpeg introuvable : winget install --id Gyan.FFmpeg -e --source winget" }
}

# Variables de backend\.env (lignes CLE=valeur, commentaires ignorés)
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"'), "Process")
    }
}

$py = Join-Path $root "backend\.venv\Scripts\python.exe"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; & '$py' -m uvicorn app.main:app --port 8000 --host 127.0.0.1"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev -- --port 5173"
Write-Host "Backend  : http://localhost:8000/api/health"
Write-Host "Frontend : http://localhost:5173  (fermer les deux fenêtres pour arrêter)"
