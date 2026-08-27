param(
  [Parameter(Mandatory = $true)]
  [string]$SetupPath,

  [string[]]$InstallRoots = @(
    'D:\app',
    "D:\app\$([char]0x7814)$([char]0x8ff9)",
    "D:\$([char]0x79d1)$([char]0x7814)$([char]0x8f6f)$([char]0x4ef6)",
    'D:\Research Tools'
  )
)

$ErrorActionPreference = 'Stop'
$appGuid = '017442f9-359a-52c7-ae9a-61365c000876'
$installRegistry = "HKCU:\Software\$appGuid"
$uninstallRegistry = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appGuid"
$yanjiName = "$([char]0x7814)$([char]0x8ff9)"
$dedicatedNames = @($yanjiName, 'Yanji', 'PaperTrail')
$resolvedSetup = (Resolve-Path -LiteralPath $SetupPath).Path
$repoRoot = Split-Path -Parent $PSScriptRoot
$packagedSmoke = Join-Path $PSScriptRoot 'packaged-smoke.js'

function Invoke-HiddenAndWait {
  param([string]$FilePath, [string[]]$Arguments)
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru -Wait -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Process failed with exit code $($process.ExitCode): $FilePath"
  }
}

function Get-ExpectedInstallDirectory {
  param([string]$SelectedRoot)
  $full = [System.IO.Path]::GetFullPath($SelectedRoot).TrimEnd('\')
  if ($dedicatedNames -contains (Split-Path -Leaf $full)) { return $full }
  return Join-Path $full $yanjiName
}

function Assert-ShortcutTarget {
  param([string]$ShortcutPath, [string]$ExpectedExe)
  if (-not (Test-Path -LiteralPath $ShortcutPath)) { throw "Missing shortcut: $ShortcutPath" }
  $shell = New-Object -ComObject WScript.Shell
  $target = $shell.CreateShortcut($ShortcutPath).TargetPath
  if ([System.IO.Path]::GetFullPath($target) -ne [System.IO.Path]::GetFullPath($ExpectedExe)) {
    throw "Shortcut target mismatch: $ShortcutPath -> $target"
  }
}

$results = @()
foreach ($selectedRoot in $InstallRoots) {
  $expectedDirectory = Get-ExpectedInstallDirectory $selectedRoot
  $expectedExe = Join-Path $expectedDirectory "$yanjiName.exe"
  $parentDirectory = Split-Path -Parent $expectedDirectory
  New-Item -ItemType Directory -Path $selectedRoot -Force | Out-Null
  $sentinel = Join-Path $parentDirectory 'YANJI_SHARED_PARENT_SENTINEL.txt'
  Set-Content -LiteralPath $sentinel -Value 'must survive Yanji uninstall' -Encoding utf8

  Invoke-HiddenAndWait $resolvedSetup @('/currentuser', '/S', "/D=$selectedRoot")
  $registeredLocation = (Get-ItemProperty -LiteralPath $installRegistry).InstallLocation
  if ([System.IO.Path]::GetFullPath($registeredLocation) -ne [System.IO.Path]::GetFullPath($expectedDirectory)) {
    throw "Install location mismatch: expected $expectedDirectory, got $registeredLocation"
  }
  if (-not (Test-Path -LiteralPath $expectedExe)) { throw "Missing installed executable: $expectedExe" }

  Assert-ShortcutTarget (Join-Path $env:USERPROFILE "Desktop\$yanjiName.lnk") $expectedExe
  Assert-ShortcutTarget (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$yanjiName.lnk") $expectedExe

  & node $packagedSmoke $expectedExe
  if ($LASTEXITCODE -ne 0) { throw "Installed executable smoke failed: $expectedExe" }

  $uninstallExe = Join-Path $expectedDirectory "Uninstall $yanjiName.exe"
  $registeredUninstaller = (Get-ItemProperty -LiteralPath $uninstallRegistry).UninstallString
  if (-not $registeredUninstaller.StartsWith("`"$uninstallExe`"")) {
    throw "Unsafe uninstall registration: $registeredUninstaller"
  }
  Invoke-HiddenAndWait $uninstallExe @('/currentuser', '/S')

  if (Test-Path -LiteralPath $expectedDirectory) { throw "Dedicated app directory survived uninstall: $expectedDirectory" }
  if (-not (Test-Path -LiteralPath $parentDirectory)) { throw "Shared parent was removed: $parentDirectory" }
  if (-not (Test-Path -LiteralPath $sentinel)) { throw "Shared-parent sentinel was removed: $sentinel" }
  Remove-Item -LiteralPath $sentinel -Force

  $results += [pscustomobject]@{
    Selected = $selectedRoot
    Installed = $expectedDirectory
    PackagedSmoke = 'PASS'
    Shortcuts = 'PASS'
    UninstallParentProtection = 'PASS'
  }
}

$results | Format-Table -AutoSize
Write-Output 'YANJI_INSTALLER_MATRIX_OK'
