param([string]$Destination)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if(!$Destination){$Destination=Join-Path $projectRoot ('dist/Tom-beta-'+(Get-Content -LiteralPath (Join-Path $projectRoot 'config/product.json') -Raw | ConvertFrom-Json).version)}
if(Test-Path -LiteralPath $Destination){throw 'Choose a new build folder. Existing installers are not overwritten.'}
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'check.mjs')
if($LASTEXITCODE -ne 0){throw 'Build checks failed.'}
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'package-installers.mjs') $Destination
if($LASTEXITCODE -ne 0){throw 'Installer build failed.'}
