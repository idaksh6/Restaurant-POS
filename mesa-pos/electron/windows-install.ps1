$ErrorActionPreference = 'Stop'

$src = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'Programs\Mesa-POS'
$exeName = 'Mesa POS.exe'

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$robo = Start-Process -FilePath 'robocopy.exe' -ArgumentList @(
  $src, $dest, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP'
) -Wait -PassThru
if ($robo.ExitCode -ge 8) {
  throw "Copy failed (robocopy exit $($robo.ExitCode))"
}

$exe = Join-Path $dest $exeName
if (-not (Test-Path $exe)) {
  throw "Could not find $exeName after copy."
}

$ws = New-Object -ComObject WScript.Shell
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mesa POS.lnk'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Mesa POS.lnk'

foreach ($shortcut in @($desktop, $startMenu)) {
  $link = $ws.CreateShortcut($shortcut)
  $link.TargetPath = $exe
  $link.WorkingDirectory = $dest
  $link.WindowStyle = 1
  $link.Description = 'Mesa KSA Restaurant POS'
  $link.Save()
}

$uninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MesaPOS'
New-Item -Path $uninstall -Force | Out-Null
New-ItemProperty -Path $uninstall -Name DisplayName -Value 'Mesa POS' -Force | Out-Null
New-ItemProperty -Path $uninstall -Name DisplayIcon -Value $exe -Force | Out-Null
New-ItemProperty -Path $uninstall -Name InstallLocation -Value $dest -Force | Out-Null
New-ItemProperty -Path $uninstall -Name Publisher -Value 'Mesa' -Force | Out-Null
New-ItemProperty -Path $uninstall -Name DisplayVersion -Value '0.1.0' -Force | Out-Null

$appPathKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Mesa POS.exe'
New-Item -Path $appPathKey -Force | Out-Null
Set-ItemProperty -Path $appPathKey -Name '(default)' -Value $exe
Set-ItemProperty -Path $appPathKey -Name Path -Value $dest

Write-Host ''
Write-Host 'Mesa POS installed.'
Write-Host "Location: $dest"
Write-Host 'Desktop shortcut: Mesa POS'
Write-Host 'Search Windows for: Mesa POS'
Write-Host ''

Start-Process -FilePath $exe
