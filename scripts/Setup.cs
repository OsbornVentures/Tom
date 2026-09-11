using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Security.Cryptography;
using System.Text;
using System.Net;
using System.Reflection;

internal class PayloadFile {public string path;public long bytes;public string sha256;public long offset;public long compressedBytes;public string url;public string archive;public string archiveEntry;}
internal class VendorArchive {public string id;public string url;public string sha256;public long bytes;}
internal class PayloadManifest {public string product;public string version;public string mode;public long totalBytes;public List<PayloadFile> files;public List<VendorArchive> archives;}
internal class Installation {public string product;public string version;public string root;public bool portable;}
internal static class TomSetup {
 internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16000000};
 internal static PayloadManifest Manifest;
 internal static long PayloadStart;
 internal static string ManifestText;
 internal static bool Busy;
 [STAThread] static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  try{
   if(!Environment.Is64BitOperatingSystem||Environment.OSVersion.Platform!=PlatformID.Win32NT||String.Equals(Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE"),"ARM64",StringComparison.OrdinalIgnoreCase)||String.Equals(Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432"),"ARM64",StringComparison.OrdinalIgnoreCase))throw new Exception("This installer requires 64-bit Intel or AMD Windows. ARM and 32-bit Windows need a separate package.");
   int build=0;Int32.TryParse(Convert.ToString(Microsoft.Win32.Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion","CurrentBuildNumber","0")),out build);if(build<10240)throw new Exception("Tom requires Windows 10 or later.");
   using(var resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload-manifest.json"))using(var reader=new StreamReader(resource))ManifestText=reader.ReadToEnd();
   Manifest=Json.Deserialize<PayloadManifest>(ManifestText);ValidateManifest(Manifest);
   using(var input=File.OpenRead(Application.ExecutablePath))using(var reader=new BinaryReader(input)){input.Seek(-16,SeekOrigin.End);PayloadStart=reader.ReadInt64();if(Encoding.ASCII.GetString(reader.ReadBytes(8))!="TOMPKG01"||PayloadStart<1024||PayloadStart>=input.Length-16)throw new Exception("This installer is incomplete. Copy the complete EXE and try again.");foreach(var entry in Manifest.files)if(entry.url==null&&entry.archive==null&&(entry.offset<0||entry.compressedBytes<0||entry.offset>input.Length-16-PayloadStart-entry.compressedBytes))throw new Exception("The installer payload is incomplete.");}
   if(args.Length>1&&args[0]=="--layout-test"){using(var form=new SetupWindow()){form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.Show();Application.DoEvents();using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(args[1]);}}return;}
   if(args.Length>1&&args[0]=="--install-test"){Install(args[1],false,delegate(string message,double fraction){},()=>false);return;}
   Application.Run(new SetupWindow());
  }catch(Exception e){Environment.ExitCode=1;if(args.Length>0)File.WriteAllText(Path.Combine(Path.GetTempPath(),"tom-setup-error.txt"),e.ToString());else MessageBox.Show(e.Message,"Tom setup",MessageBoxButtons.OK,MessageBoxIcon.Information);}
 }
 internal static void ValidateManifest(PayloadManifest manifest){
  if(manifest.product!="Tom"||manifest.files==null||manifest.files.Count<5)throw new Exception("The Tom manifest is incomplete.");
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
  foreach(var e in manifest.files){ResolveInside(Path.GetTempPath(),e.path);if(!seen.Add(e.path.Replace('/','\\'))||e.bytes<0||e.sha256==null||e.sha256.Length!=64||e.path.StartsWith(".state",StringComparison.OrdinalIgnoreCase)||e.path=="installation.json"||e.path=="installed-manifest.json")throw new Exception("Invalid package entry.");total=checked(total+e.bytes);}
  if(total!=manifest.totalBytes)throw new Exception("The package size does not match its manifest.");
 }
 internal static string ResolveInside(string root,string relative){
  if(String.IsNullOrWhiteSpace(relative)||Path.IsPathRooted(relative)||relative.Contains(":")||relative.IndexOfAny(new[]{'\0','"'})>=0)throw new Exception("Invalid payload path.");
  foreach(string part in relative.Replace('\\','/').Split('/'))if(part==".."||part=="."||part.Length==0||part.EndsWith(".")||part.EndsWith(" "))throw new Exception("Invalid payload path segment.");
  string full=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar))),prefix=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
  if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new Exception("A payload path escaped its package.");return full;
 }
 internal static void NoLinks(string path){for(var d=new DirectoryInfo(path);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("Choose a folder without links or redirected directories.");}
 internal static void NotRunning(string target){
  string session=Path.Combine(target,".state","session.json");
  if(File.Exists(session)){try{var data=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(session));object pid;if(data.TryGetValue("pid",out pid)){var p=Process.GetProcessById(Convert.ToInt32(pid));if(!p.HasExited)throw new IOException("Quit Tom from Settings before repairing or updating it.");}}catch(ArgumentException){}catch(InvalidOperationException){} }
  foreach(string name in new[]{"Start-Tom.exe","runtime/node.exe","runtime/llama/llama-server.exe","runtime/vulkan/llama-server.exe"}){string file=Path.Combine(target,name);if(File.Exists(file))try{using(var stream=new FileStream(file,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){} }catch(IOException){throw new Exception("Quit Tom and its tray helper before repairing or updating it.");}}
 }
 internal static void Download(string url,string output,long expected,string expectedHash,Action<long> progress,Func<bool> cancelled){
  Uri address;if(!Uri.TryCreate(url,UriKind.Absolute,out address)||address.Scheme!="https")throw new Exception("A vendor download must use HTTPS.");
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  var request=(HttpWebRequest)WebRequest.Create(address);request.UserAgent="Tom-Setup/0.5";request.Timeout=30000;request.ReadWriteTimeout=30000;
  using(var response=(HttpWebResponse)request.GetResponse()){if(response.ResponseUri.Scheme!="https")throw new Exception("A vendor redirected to an insecure download.");using(var input=response.GetResponseStream())CopyVerified(input,output,expected,expectedHash,progress,cancelled);}
 }
 internal static void CopyVerified(Stream input,string output,long expected,string expectedHash,Action<long> progress,Func<bool> cancelled){
  using(var hash=SHA256.Create())using(var dest=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
   var buffer=new byte[262144];long count=0;int n;
   while((n=input.Read(buffer,0,buffer.Length))>0){if(cancelled())throw new OperationCanceledException("Installation cancelled. Your existing Tom is unchanged.");count+=n;if(count>expected)throw new Exception("A package file exceeds its expected size.");dest.Write(buffer,0,n);hash.TransformBlock(buffer,0,n,null,0);progress(n);}
   hash.TransformFinalBlock(new byte[0],0,0);dest.Flush(true);
   if(count!=expected||BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant()!=expectedHash)throw new Exception("A file failed verification. Please copy or download the installer again.");
  }
 }
 internal static bool Existing(string target){
  if(!Directory.Exists(target)||Directory.GetFileSystemEntries(target).Length==0)return false;
  var marker=Path.Combine(target,"installation.json");if(!File.Exists(marker))throw new Exception("This folder contains other files. Choose an empty folder or an existing Tom installation.");
  var installed=Json.Deserialize<Installation>(File.ReadAllText(marker));if(installed.product!="Tom"||!String.Equals(installed.root,target,StringComparison.OrdinalIgnoreCase)||!File.Exists(Path.Combine(target,"installed-manifest.json")))throw new Exception("This folder is not a recognized Tom installation. Choose a new folder.");return true;
 }
 internal static string NormalizeName(string value){
  if(value==null)throw new Exception("Enter a name of 1–60 characters.");foreach(char c in value)if(Char.IsControl(c)||c=='\u2028'||c=='\u2029')throw new Exception("Enter your name on one line.");value=value.Trim();if(value.Length==0||value.Length>60)throw new Exception("Enter a name of 1–60 characters.");return value;
 }
 internal static string ReadPreferredName(string target){try{return NormalizeName(Convert.ToString(Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(target,".state","profile.json")))["displayName"]));}catch{return Environment.UserName;}}
 internal static void WritePreferredName(string target,string displayName){string directory=Path.Combine(target,".state");Directory.CreateDirectory(directory);File.WriteAllText(Path.Combine(directory,"profile.json"),Json.Serialize(new {displayName=NormalizeName(displayName)}));}
 internal static void Install(string target,bool integrate,Action<string,double> progress,Func<bool> cancelled,string displayName=null){
  target=Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar);if(target.StartsWith("\\\\")||target==Path.GetPathRoot(target).TrimEnd('\\')||target.Contains("\""))throw new Exception("Choose a local Tom application folder.");
  displayName=NormalizeName(displayName??ReadPreferredName(target));
  NoLinks(target);bool existing=Existing(target);if(existing)NotRunning(target);
  long headroom=Manifest.totalBytes+(existing?Manifest.totalBytes:0)+1073741824;
  if(new DriveInfo(Path.GetPathRoot(target)).AvailableFreeSpace<headroom)throw new Exception("Tom needs "+(headroom/1073741824.0).ToString("0.0")+" GB of free disk space to install safely.");
  string staging=target+".installing-"+Guid.NewGuid().ToString("N"),backup=target+".rollback-"+Guid.NewGuid().ToString("N");Directory.CreateDirectory(staging);long copied=0;bool committed=false;
  try{
   string downloads=Path.Combine(staging,".downloads");Directory.CreateDirectory(downloads);var archives=new Dictionary<string,string>();
   using(var package=File.OpenRead(Application.ExecutablePath))foreach(var entry in Manifest.files){
    if(cancelled())throw new OperationCanceledException("Installation cancelled. Your existing Tom is unchanged.");
    string dest=ResolveInside(staging,entry.path);Directory.CreateDirectory(Path.GetDirectoryName(dest));
    Action<long> tick=n=>{copied+=n;progress((entry.url!=null||entry.archive!=null?"Downloading and checking ":"Installing and checking ")+Path.GetFileName(entry.path),(double)copied/Manifest.totalBytes*.94);};
    if(entry.url!=null)Download(entry.url,dest,entry.bytes,entry.sha256,tick,cancelled);
    else if(entry.archive!=null){
     if(!archives.ContainsKey(entry.archive)){var source=Manifest.archives.Find(a=>a.id==entry.archive);if(source==null)throw new Exception("Missing vendor archive.");string zip=ResolveInside(downloads,source.id+".zip");Download(source.url,zip,source.bytes,source.sha256,n=>progress("Downloading the "+source.id+" runtime",(double)copied/Manifest.totalBytes*.94),cancelled);archives.Add(entry.archive,zip);}
     using(var zip=ZipFile.OpenRead(archives[entry.archive])){var member=zip.GetEntry(entry.archiveEntry);if(member==null)throw new Exception("The vendor archive is missing "+entry.archiveEntry);using(var input=member.Open())CopyVerified(input,dest,entry.bytes,entry.sha256,tick,cancelled);}
    }else{package.Position=PayloadStart+entry.offset;using(var input=new DeflateStream(package,CompressionMode.Decompress,true))CopyVerified(input,dest,entry.bytes,entry.sha256,tick,cancelled);}
   }
   Directory.Delete(downloads,true);
   File.WriteAllText(Path.Combine(staging,"installation.json"),Json.Serialize(new Installation{product="Tom",version=Manifest.version,root=target,portable=!integrate}));File.WriteAllText(Path.Combine(staging,"installed-manifest.json"),ManifestText);
   WritePreferredName(staging,displayName);
   if(cancelled())throw new OperationCanceledException("Installation cancelled. Your existing Tom is unchanged.");
   if(existing){NotRunning(target);progress("Applying verified files. Keeping your conversations and preferences.",.96);CommitRepair(staging,backup,target);}
   else{if(Directory.Exists(target))Directory.Delete(target,false);Directory.Move(staging,target);}committed=true;
   if(integrate){progress("Adding Tom to this Windows account",.98);Integrate(target,false);}progress("Tom is installed. Open Tom when you are ready.",1);
  }finally{
   if(Directory.Exists(staging)&&Path.GetFullPath(staging).StartsWith(target+".installing-",StringComparison.OrdinalIgnoreCase))Directory.Delete(staging,true);
   if(committed&&Directory.Exists(backup)&&Path.GetFullPath(backup).StartsWith(target+".rollback-",StringComparison.OrdinalIgnoreCase))Directory.Delete(backup,true);
  }
 }
 internal static void CommitRepair(string staging,string backup,string target){
  var applied=new List<string>();var saved=new List<string>();Directory.CreateDirectory(backup);
  try{foreach(string file in Directory.GetFiles(staging,"*",SearchOption.AllDirectories)){string rel=file.Substring(staging.Length+1),dest=ResolveInside(target,rel),old=ResolveInside(backup,rel);NoLinks(Path.GetDirectoryName(dest));if(File.Exists(dest)){if((File.GetAttributes(dest)&FileAttributes.ReparsePoint)!=0)throw new Exception("A program file is a link. Repair stopped.");Directory.CreateDirectory(Path.GetDirectoryName(old));File.Move(dest,old);saved.Add(rel);}Directory.CreateDirectory(Path.GetDirectoryName(dest));File.Move(file,dest);applied.Add(rel);}}
  catch{foreach(string rel in applied)File.Delete(ResolveInside(target,rel));foreach(string rel in saved)File.Move(ResolveInside(backup,rel),ResolveInside(target,rel));throw;}
 }
 internal static void Integrate(string target,bool remove){
  var start=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell/v1.0/powershell.exe"),"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(target,"scripts/integrate-windows.ps1")+"\""+(remove?" -Remove":"")){WorkingDirectory=target,UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardOutput=true};
  using(var p=Process.Start(start)){var error=p.StandardError.ReadToEndAsync();var output=p.StandardOutput.ReadToEndAsync();p.WaitForExit();Task.WaitAll(error,output);if(p.ExitCode!=0)throw new Exception("Tom's files are installed, but Windows shortcuts need attention. Run setup again to repair them. "+error.Result);}
 }
}
internal sealed class SetupWindow : BrandWindow {
 TextBox destination,preferredName;Button install,browse,open,cancel;CheckBox portable;Label message;ProgressBar progress;volatile bool cancelled;
 internal SetupWindow(){
  ClientSize=new Size(680,728);Text="Install Tom "+TomSetup.Manifest.version+" beta";LabelAt("PRIVATE BY PLACE. PRESENT BY DESIGN.",38,98,590,24,9,Green);LabelAt("A little help. Right here.",34,139,610,48,25,Paper);
  bool network=TomSetup.Manifest.mode=="network";LabelAt(network?"Install Tom with downloads from the original vendors.":"The complete app and model. Install locally, including from USB.",38,195,600,28,11,Muted);
  LabelAt("01  Install Tom     02  Check this computer     03  Make yourself at home",38,243,610,25,10,Paper);
  LabelAt("Windows 10 / 11 · Intel & AMD x64 · CPU + compatible graphics\n"+(TomSetup.Manifest.totalBytes/1000000000.0).ToString("0.00")+" GB installed · 8 GB RAM recommended · "+(network?"Internet required":"Complete offline edition"),38,282,610,48,10,Muted);
  destination=new TextBox{Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Tom"),Location=new Point(38,351),Size=new Size(489,30),BackColor=Color.FromArgb(16,33,30),ForeColor=Paper,AccessibleName="Install location"};Controls.Add(destination);
  browse=ButtonAt("Choose…",539,347,103,false);browse.Click+=delegate{using(var folder=new FolderBrowserDialog{Description="Choose an empty folder or an existing Tom installation"})if(folder.ShowDialog()==DialogResult.OK)destination.Text=folder.SelectedPath;};
  portable=new CheckBox{Text="Portable installation · no Windows shortcuts or menus",Location=new Point(38,395),Size=new Size(605,28)};Controls.Add(portable);
  LabelAt("What should Tom call you?",38,434,604,25,11,Paper);
  preferredName=new TextBox{Text=TomSetup.ReadPreferredName(destination.Text),Location=new Point(38,465),Size=new Size(604,30),MaxLength=60,BackColor=Color.FromArgb(16,33,30),ForeColor=Paper,AccessibleName="What should Tom call you?"};Controls.Add(preferredName);
  bool nameEdited=false,settingName=false;preferredName.TextChanged+=delegate{if(!settingName)nameEdited=true;};destination.TextChanged+=delegate{if(!nameEdited){settingName=true;preferredName.Text=TomSetup.ReadPreferredName(destination.Text);settingName=false;}};
  LabelAt("Tom + Gemma 4: Apache 2.0 · llama.cpp: MIT · Full credits below.",38,504,605,24,9,Muted);
  var prerequisite=new LinkLabel{Text="Requires Microsoft Visual C++ x64 runtime · Get it from Microsoft",Location=new Point(38,532),Size=new Size(604,27),LinkColor=Green,ActiveLinkColor=Paper,VisitedLinkColor=Green,AccessibleName="Microsoft Visual C++ prerequisite"};Controls.Add(prerequisite);prerequisite.LinkClicked+=delegate{Process.Start(new ProcessStartInfo("https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist"){UseShellExecute=true});};
  message=LabelAt("Install prerequisites before going offline. Updating this folder keeps your conversations, name and preferences.",38,571,605,49,10,Muted);progress=new ProgressBar{Location=new Point(38,628),Size=new Size(604,7),Style=ProgressBarStyle.Continuous};Controls.Add(progress);
  var notices=ButtonAt("License notices",38,660,139,false);notices.Click+=delegate{using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("notices.txt"))using(var reader=new StreamReader(stream))using(var form=new Form{Text="Tom · License notices",Size=new Size(760,580),StartPosition=FormStartPosition.CenterParent}){form.Controls.Add(new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill,Text=reader.ReadToEnd(),Font=new Font("Segoe UI",10)});form.ShowDialog(this);}};
  cancel=ButtonAt("Cancel",366,660,108,false);cancel.Click+=delegate{if(TomSetup.Busy){cancelled=true;cancel.Enabled=false;message.Text="Cancelling after the current download read finishes…";}else Close();};
  install=ButtonAt("Install Tom",486,660,156,true);destination.TextChanged+=delegate{install.Text=File.Exists(Path.Combine(destination.Text,"installation.json"))?"Repair / update":"Install Tom";};if(File.Exists(Path.Combine(destination.Text,"installation.json")))install.Text="Repair / update";
  open=ButtonAt("Open Tom",486,660,156,true);open.Visible=false;open.Click+=delegate{Process.Start(new ProcessStartInfo(Path.Combine(destination.Text,"Start-Tom.exe")){WorkingDirectory=destination.Text,UseShellExecute=false});Close();};
  install.Click+=async delegate{string chosenName;try{chosenName=TomSetup.NormalizeName(preferredName.Text);}catch(Exception e){message.Text=e.Message;preferredName.Focus();return;}cancelled=false;TomSetup.Busy=true;install.Enabled=false;browse.Enabled=false;destination.Enabled=false;portable.Enabled=false;preferredName.Enabled=false;string target=destination.Text;bool integrate=!portable.Checked;int last=Environment.TickCount;
   try{await Task.Run(()=>TomSetup.Install(target,integrate,(text,fraction)=>{if(Environment.TickCount-last<100&&fraction<1)return;last=Environment.TickCount;BeginInvoke((Action)delegate{message.Text=text;progress.Value=Math.Max(0,Math.Min(100,(int)(fraction*100)));});},()=>cancelled,chosenName));install.Visible=false;open.Visible=true;cancel.Text="Close";message.Text="Welcome home. Tom will check this computer when you open it.";}
   catch(Exception error){message.Text=error.Message;install.Enabled=true;browse.Enabled=true;destination.Enabled=true;portable.Enabled=true;preferredName.Enabled=true;progress.Value=0;}finally{TomSetup.Busy=false;cancel.Enabled=true;}
  };
  FormClosing+=delegate(object sender,FormClosingEventArgs e){if(TomSetup.Busy){e.Cancel=true;cancelled=true;message.Text="Finishing the current operation before closing…";}};
 }
}
