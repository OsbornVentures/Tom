param([string]$Destination)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$version=(Get-Content -LiteralPath (Join-Path $projectRoot 'config/product.json') -Raw | ConvertFrom-Json).version
if(!$Destination){$Destination=Join-Path $projectRoot ("dist/Tom-offline-"+$version)}
$packageRoot=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $packageRoot){throw 'Choose a new package folder. Existing builds are not overwritten.'}
& (Join-Path $projectRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'check.mjs')
if($LASTEXITCODE -ne 0){throw 'Build checks failed. No package was created.'}
& (Join-Path $PSScriptRoot 'build-launcher.ps1')
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
$payload=Join-Path $packageRoot 'Tom-Payload'
New-Item -ItemType Directory -Path $payload | Out-Null
foreach($folder in @('src','public','config','licenses','browser-extension','docs')){Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $payload -Recurse}
$baseConfig=Get-Content -LiteralPath (Join-Path $projectRoot 'config/runtime.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path (Join-Path $payload 'models') | Out-Null
foreach($modelPath in @($baseConfig.model.path,$baseConfig.vision.path)){Copy-Item -LiteralPath (Join-Path $projectRoot $modelPath) -Destination (Join-Path $payload $modelPath)}
New-Item -ItemType Directory -Path (Join-Path $payload 'runtime/llama') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime/node.exe') -Destination (Join-Path $payload 'runtime')
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime/browser') -Destination (Join-Path $payload 'runtime') -Recurse
$nativeNames=@('ggml.dll','ggml-base.dll','ggml-rpc.dll','libomp.dll','llama.dll','llama-common.dll','llama-server.exe','llama-server-impl.dll','mtmd.dll','LICENSE-LLVM-OpenMP')
$nativeFiles=Get-ChildItem -LiteralPath (Join-Path $projectRoot 'runtime/llama') -File | Where-Object {$nativeNames -contains $_.Name -or $_.Name -like 'ggml-cpu-*.dll' -or $_.Name -match '^(msvcp140|vcruntime140|concrt140|vcamp140|vccorlib140|vcomp140).*\.dll$'}
foreach($file in $nativeFiles){Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $payload 'runtime/llama')}
$components=@($nativeFiles | Where-Object {$_.Extension -in @('.dll','.exe')} | ForEach-Object {@{path='runtime/llama/'+$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
$components | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $payload 'config/runtime-components.json') -Encoding ASCII
foreach($name in @('Start-Tom.exe','README.md','THIRD_PARTY_NOTICES.md')){Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $payload}
New-Item -ItemType Directory -Path (Join-Path $payload 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts/integrate-windows.ps1') -Destination (Join-Path $payload 'scripts')
$files=@(Get-ChildItem -LiteralPath $payload -Recurse -File | ForEach-Object {[pscustomobject]@{path=$_.FullName.Substring($payload.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
$manifest=@{version=$version;totalBytes=[long](($files|Measure-Object bytes -Sum).Sum);files=$files}
$manifest|ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $packageRoot 'payload-manifest.json') -Encoding UTF8
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /win32icon:"$projectRoot\design-assets\kernel.ico" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /out:"$packageRoot\Setup-Tom.exe" "$PSScriptRoot\Installer.cs"
if($LASTEXITCODE -ne 0){throw 'Setup compilation failed.'}
'Keep Setup-Tom.exe, payload-manifest.json and Tom-Payload together. This development package installs E2B plus vision without internet. The app performs its CPU check after opening. The manifest is hashed but not release-signed. Commercial distribution terms and runtime redistribution rights must be finalized before sale.' | Set-Content -LiteralPath (Join-Path $packageRoot 'READ-ME.txt')
[pscustomobject]@{SetupBytes=(Get-Item -LiteralPath (Join-Path $packageRoot 'Setup-Tom.exe')).Length;PayloadBytes=$manifest.totalBytes;PayloadFiles=$files.Count;Package=$packageRoot} | ConvertTo-Json
