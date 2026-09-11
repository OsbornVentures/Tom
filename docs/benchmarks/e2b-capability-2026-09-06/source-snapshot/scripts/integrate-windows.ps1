param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$launcher = Join-Path $projectRoot 'Start-Tom.exe'
if (!(Test-Path -LiteralPath $launcher)) { throw 'Build Start-Tom.exe before integrating Windows.' }
$baseKey = 'HKCU:\Software\Classes\'
$entries = @(
  @{ Relative='*\shell\Tom.Ask'; Argument='--ask-file "%1"' },
  @{ Relative='Directory\shell\Tom.Ask'; Argument='--ask-folder "%1"' },
  @{ Relative='Directory\Background\shell\Tom.Ask'; Argument='--ask-folder "%V"' }
)
$changed = @()
foreach ($entry in $entries) {
  $key = $baseKey + $entry.Relative
  if (!$key.StartsWith($baseKey,[StringComparison]::OrdinalIgnoreCase) -or !$key.EndsWith('\Tom.Ask')) { throw 'Unexpected registry target.' }
  $exists = Test-Path -LiteralPath $key
  if ($exists) {
    $owner = Get-ItemPropertyValue -LiteralPath $key -Name 'TomOwner' -ErrorAction SilentlyContinue
    if ($owner -ne $projectRoot) { throw "Another installation owns $key. It was left unchanged." }
  }
  if ($Remove) {
    if ($exists) { Remove-Item -LiteralPath $key -Recurse; $changed += $key }
  } else {
    New-Item -Path $key -Force | Out-Null
    Set-Item -LiteralPath $key -Value 'Ask Tom'
    New-ItemProperty -LiteralPath $key -Name 'TomOwner' -Value $projectRoot -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'Icon' -Value $launcher -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $key -Name 'MultiSelectModel' -Value 'Single' -PropertyType String -Force | Out-Null
    $command = $key + '\command'
    New-Item -Path $command -Force | Out-Null
    Set-Item -LiteralPath $command -Value ('"' + $launcher + '" ' + $entry.Argument)
    $changed += $key
  }
}
$shellObject = New-Object -ComObject WScript.Shell
$shortcutPaths = @(
  (Join-Path ([Environment]::GetFolderPath('SendTo')) 'Ask Tom.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Tom.lnk')
)
foreach ($shortcutPath in $shortcutPaths) {
  $shortcut = $shellObject.CreateShortcut($shortcutPath)
  if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.TargetPath -ne $launcher) { throw "Another shortcut owns $shortcutPath. It was left unchanged." }
  if ($Remove) { if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath } }
  else {
    $shortcut.TargetPath = $launcher
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = 'Ask Tom on this computer'
    $shortcut.Arguments = if ($shortcutPath.EndsWith('Ask Tom.lnk')) { '--ask-file' } else { '' }
    $shortcut.Save()
  }
}
New-Item -ItemType Directory -Path (Join-Path $projectRoot '.state') -Force | Out-Null
@{installed=(!$Remove);root=$projectRoot;keys=$changed;shortcuts=$shortcutPaths;time=(Get-Date).ToString('o')} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $projectRoot '.state\windows-integration.json') -Encoding UTF8
Write-Output $(if ($Remove) {'Tom Windows integration removed.'} else {'Ask Tom installed for this account: Explorer, Send to, and Start menu. Ctrl Alt T is available while the tray helper runs.'})
