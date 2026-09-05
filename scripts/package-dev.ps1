param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'check.mjs')
if($LASTEXITCODE -ne 0){throw 'Build checks failed. No package was created.'}
& (Join-Path $PSScriptRoot 'build-launcher.ps1')
$packageDestination=[IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $packageDestination) { throw 'Use a new, empty destination. Existing packages are never overwritten.' }
if ($packageDestination -eq $projectRoot) { throw 'Choose a separate package folder.' }
New-Item -ItemType Directory -Path $packageDestination | Out-Null
foreach ($folder in @('src','public','config','models','runtime','licenses','browser-extension','docs')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $packageDestination -Recurse
}
foreach ($name in @('Start-Tom.exe','README.md','THIRD_PARTY_NOTICES.md')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $packageDestination }
New-Item -ItemType Directory -Path (Join-Path $packageDestination 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\integrate-windows.ps1') -Destination (Join-Path $packageDestination 'scripts')
$manifest=foreach($item in Get-ChildItem -LiteralPath $packageDestination -Recurse -File){[pscustomobject]@{path=$item.FullName.Substring($packageDestination.Length+1);bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $item.FullName).Hash.ToLowerInvariant()}}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packageDestination 'SHA256SUMS.json')
Write-Output 'Development package created. This is an unsigned test build, not the commercial installer.'
