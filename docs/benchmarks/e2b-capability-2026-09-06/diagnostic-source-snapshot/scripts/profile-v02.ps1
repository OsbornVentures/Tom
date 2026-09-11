$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$session=Get-Content -LiteralPath (Join-Path $projectRoot '.state\session.json') -Raw | ConvertFrom-Json
$processes=Get-CimInstance Win32_Process
$groups=@{}
$groups['supervisor']=@([int]$session.pid)
$groups['model']=@($processes | Where-Object { $_.ExecutablePath -eq (Join-Path $projectRoot 'runtime\llama\llama-server.exe') } | ForEach-Object { [int]$_.ProcessId })
$groups['windowsHelper']=@($processes | Where-Object { $_.ExecutablePath -eq (Join-Path $projectRoot 'Start-Tom.exe') } | ForEach-Object { [int]$_.ProcessId })
$browserRoot=@($processes | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like ('*' + (Join-Path $projectRoot '.state\browser-profile') + '*') } | ForEach-Object { [int]$_.ProcessId })
$browserIds=[Collections.Generic.HashSet[int]]::new()
foreach($item in $browserRoot){$browserIds.Add($item)|Out-Null}
do { $added=0; foreach($item in $processes){if($browserIds.Contains([int]$item.ParentProcessId) -and $browserIds.Add([int]$item.ProcessId)){$added++}} } while($added -gt 0)
$groups['browser']=@($browserIds)
$result=foreach($group in $groups.GetEnumerator()){
 $items=@(foreach($number in $group.Value){Get-Process -Id $number -ErrorAction SilentlyContinue})
 [pscustomobject]@{component=$group.Key;processes=$items.Count;pids=@($group.Value);workingSetMiB=[math]::Round(($items|Measure-Object WorkingSet64 -Sum).Sum/1MB,2);privateMiB=[math]::Round(($items|Measure-Object PrivateMemorySize64 -Sum).Sum/1MB,2)}
}
@{time=(Get-Date).ToString('o');components=$result;note='Snapshot on a 32 GB host. Working-set sums can double-count shared pages. These are not peaks or a minimum RAM claim.'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectRoot 'audit\v02\process-profile.json') -Encoding UTF8
$result | Format-Table component,processes,workingSetMiB,privateMiB
