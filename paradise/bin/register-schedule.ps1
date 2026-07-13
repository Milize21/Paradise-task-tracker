# Daftarkan scheduled task backup DB (harian 02:00) + healthcheck (tiap 30 menit).
# Jalankan sekali: klik-kanan > Run with PowerShell, ATAU dari PowerShell:
#   powershell -ExecutionPolicy Bypass -File "paradise\bin\register-schedule.ps1"
# Tidak butuh admin (terdaftar di konteks user). Built by B.E.R.

$ErrorActionPreference = "Stop"
$bash = "C:\Program Files\Git\bin\bash.exe"
if (-not (Test-Path $bash)) { throw "Git Bash tidak ditemukan di $bash — sesuaikan path." }

# Root repo = dua level di atas file ini, dalam format path Git Bash (/d/...)
$repoWin = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$drive = $repoWin.Substring(0,1).ToLower()
$repo = "/$drive" + $repoWin.Substring(2).Replace("\","/")

# --- Task 1: Backup DB harian 02:00 ---
$bkArgs = "-lc `"cd '$repo' && COMPOSE_FILE=docker-compose-local.yml bash paradise/bin/backup-db.sh >> paradise/backup.log 2>&1`""
$a1 = New-ScheduledTaskAction -Execute $bash -Argument $bkArgs
$t1 = New-ScheduledTaskTrigger -Daily -At 2:00AM
$s1 = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Paradise - Backup DB" -Action $a1 -Trigger $t1 -Settings $s1 `
  -Description "Backup PostgreSQL harian + retensi 14 hari (B.E.R)" -Force | Out-Null
Write-Host "OK: 'Paradise - Backup DB' terdaftar (harian 02:00)." -ForegroundColor Green

# --- Task 2: Healthcheck tiap 30 menit ---
$hcArgs = "-lc `"cd '$repo' && COMPOSE_FILE=docker-compose-local.yml WEB_URL=http://localhost:3000 bash paradise/bin/healthcheck.sh >> paradise/healthcheck.log 2>&1`""
$a2 = New-ScheduledTaskAction -Execute $bash -Argument $hcArgs
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)
$s2 = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "Paradise - Healthcheck" -Action $a2 -Trigger $t2 -Settings $s2 `
  -Description "Cek kesehatan layanan tiap 30 menit (B.E.R)" -Force | Out-Null
Write-Host "OK: 'Paradise - Healthcheck' terdaftar (tiap 30 menit)." -ForegroundColor Green

Write-Host ""
Get-ScheduledTask -TaskName "Paradise*" | Select-Object TaskName, State | Format-Table -AutoSize
Write-Host "Selesai. Untuk tes backup sekarang:  Start-ScheduledTask -TaskName 'Paradise - Backup DB'" -ForegroundColor Cyan
