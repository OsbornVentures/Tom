// GitHub assets must be below 2 GiB. Preserve the original full EXE on disk/USB.
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.resolve(process.argv[2]),version=JSON.parse(await fs.readFile(new URL('../config/product.json',import.meta.url))).version;
const name=`Tom-${version}-Offline-Setup.exe`,file=path.join(dir,name),bytes=(await fs.stat(file)).size,partSize=1900000000;
const digest=async p=>{const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');};
const expected=(await fs.readFile(file+'.sha256','utf8')).split(/\s/)[0];if(await digest(file)!==expected)throw Error('The full installer checksum does not match.');
const parts=[];
for(let start=0,index=1;start<bytes;start+=partSize,index++){
 const part=name+'.part'+index,target=path.join(dir,part);await pipeline(createReadStream(file,{start,end:Math.min(bytes,start+partSize)-1}),createWriteStream(target,{flags:'wx'}));
 const sha256=await digest(target);parts.push({name:part,bytes:(await fs.stat(target)).size,sha256});console.log(part,sha256);
}
const partRows=parts.map(p=>`  @{Name='${p.name}';Bytes=${p.bytes};SHA256='${p.sha256}'}`).join(',\n');
const script=`# Reconstruct the exact offline installer; no downloads or automatic execution.\n$ErrorActionPreference='Stop'\n$releaseFolder=[IO.Path]::GetFullPath($PSScriptRoot)\n$parts=@(\n${partRows}\n)\n$expected='${expected}'\n$output=Join-Path $releaseFolder '${name}'\nif(Test-Path -LiteralPath $output){if((Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash -eq $expected){Write-Host 'The complete verified installer is already here.';exit 0};throw 'An existing EXE has a different checksum. Keep it separately before continuing.'}\nforeach($part in $parts){$inputFile=Join-Path $releaseFolder $part.Name;Write-Host ('Checking '+$part.Name);if(!(Test-Path -LiteralPath $inputFile -PathType Leaf)){throw ('Download the missing file: '+$part.Name)};if((Get-Item -LiteralPath $inputFile).Length -ne $part.Bytes -or (Get-FileHash -LiteralPath $inputFile -Algorithm SHA256).Hash -ne $part.SHA256){throw ('Checksum failed: '+$part.Name+'. Download that part again.')}}\n$temp=$output+'.partial'\nif(Test-Path -LiteralPath $temp){throw 'A partial file already exists. Move it aside before trying again.'}\n$created=$false\ntry{\n $dest=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$created=$true\n try{foreach($part in $parts){Write-Host ('Joining '+$part.Name);$source=[IO.File]::OpenRead((Join-Path $releaseFolder $part.Name));try{$source.CopyTo($dest,1048576)}finally{$source.Dispose()}};$dest.Flush($true)}finally{$dest.Dispose()}\n Write-Host 'Checking the finished EXE…'\n if((Get-Item -LiteralPath $temp).Length -ne ${bytes} -or (Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash -ne $expected){throw 'The reconstructed EXE failed verification.'}\n Move-Item -LiteralPath $temp -Destination $output\n Write-Host ('Ready: '+$output)\n Write-Host 'Open that EXE when you want to install Tom. The two download parts can be kept as a backup.'\n}finally{if($created -and (Test-Path -LiteralPath $temp)){if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($temp)) -ne $releaseFolder){throw 'Unexpected temporary file path'};Remove-Item -LiteralPath $temp}}\n`;
await fs.writeFile(path.join(dir,`Join-Tom-${version}.ps1`),'\ufeff'+script);
await fs.writeFile(path.join(dir,`Join-Tom-${version}.cmd`),`@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Join-Tom-${version}.ps1"\r\nif errorlevel 1 echo The installer could not be reconstructed. Read the error above.\r\npause\r\n`);
const network=`Tom-${version}-Network-Setup.exe`,networkHash=await digest(path.join(dir,network));
const small=[`Join-Tom-${version}.ps1`,`Join-Tom-${version}.cmd`];
const sums=[expected+'  '+name,networkHash+'  '+network,...parts.map(p=>p.sha256+'  '+p.name)];for(const f of small)sums.push(await digest(path.join(dir,f))+'  '+f);
await fs.writeFile(path.join(dir,'SHA256SUMS.txt'),sums.join('\n')+'\n');
await fs.writeFile(path.join(dir,'offline-parts.json'),JSON.stringify({version,original:{name,bytes,sha256:expected},parts},null,2)+'\n');
console.log('Created two verified parts and the local reconstruction helper.');
