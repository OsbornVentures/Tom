$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$projectRoot=Split-Path -Parent $PSScriptRoot
$assembly=[Reflection.Assembly]::LoadFrom((Join-Path $projectRoot 'Start-Tom.exe'))
$type=$assembly.GetType('AskWindow',$true)
$flags=[Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::NonPublic
$form=[Activator]::CreateInstance($type,$flags,$null,@('Selected subject: a fresh start for Tom.',$null),$null)
try {
  $form.StartPosition=[Windows.Forms.FormStartPosition]::Manual
  $form.Location=New-Object Drawing.Point(-20000,-20000)
  $form.Show()
  [Windows.Forms.Application]::DoEvents()
  $labels=@($form.Controls | ForEach-Object {$_.Text})
  foreach($label in @('Tom','Screenshot','Web search','Open in Tom','Paste')){if($label -notin $labels){throw "Missing native control: $label"}}
  $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
  try{$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save((Join-Path $projectRoot 'audit\v03\native-ask.png'),[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}
  Write-Output 'Native Ask Tom layout rendered with expected controls.'
}finally{$form.Dispose()}
