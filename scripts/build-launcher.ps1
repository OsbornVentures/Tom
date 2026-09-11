param([string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if(!$Destination){$Destination=Join-Path $projectRoot 'Start-Tom.exe'}
$nodeDestination = Join-Path $projectRoot 'runtime\node.exe'
if (!(Test-Path -LiteralPath $nodeDestination)) { throw 'Restore the pinned runtime/node.exe before building. See docs/BUILD.md.' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework compiler is unavailable on this development machine.' }
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
& $compiler /nologo /target:winexe /win32icon:"$projectRoot\design-assets\kernel.ico" /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll /reference:"$framework\WPF\UIAutomationClient.dll" /reference:"$framework\WPF\UIAutomationTypes.dll" /reference:"$framework\WPF\WindowsBase.dll" /out:"$Destination" "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Get-Item -LiteralPath $Destination | Select-Object Name,Length
