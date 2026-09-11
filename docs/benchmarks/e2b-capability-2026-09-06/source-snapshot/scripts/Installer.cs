using System;
using System.IO;
using System.Collections.Generic;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Security.Cryptography;

internal class PayloadFile {public string path;public long bytes;public string sha256;}
internal class PayloadManifest {public string version;public long totalBytes;public List<PayloadFile> files;}
internal static class TomSetup {
 internal static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 internal static readonly string Payload=Path.Combine(Root,"Tom-Payload");
 internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16000000};
 internal static PayloadManifest Manifest;
 [STAThread] static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  try{
   if(!Environment.Is64BitOperatingSystem||Environment.OSVersion.Platform!=PlatformID.Win32NT||String.Equals(Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE"),"ARM64",StringComparison.OrdinalIgnoreCase)||String.Equals(Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432"),"ARM64",StringComparison.OrdinalIgnoreCase))throw new Exception("This package is for 64-bit Windows. Use a matching package for another system.");
   int windowsBuild=0;Int32.TryParse(Convert.ToString(Microsoft.Win32.Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion","CurrentBuildNumber","0")),out windowsBuild);if(windowsBuild<10240)throw new Exception("Tom requires Windows 10 or later. Windows 11 is the tested release target.");
   Manifest=Json.Deserialize<PayloadManifest>(File.ReadAllText(Path.Combine(Root,"payload-manifest.json")));
   if(Manifest.files==null||Manifest.files.Count<5)throw new Exception("The payload manifest is incomplete.");
   if(args.Length>0&&args[0]=="--layout-test"){using(var form=new SetupWindow()){form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.Show();Application.DoEvents();using(Bitmap b=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(b,new Rectangle(Point.Empty,b.Size));b.Save(args[1]);}return;}}
   if(args.Length>1&&args[0]=="--install-test"){Install(args[1],false,delegate(string message,double fraction){});File.WriteAllText(Path.Combine(Root,"install-test-result.json"),Json.Serialize(new {passed=true,target=Path.GetFullPath(args[1]),files=Manifest.files.Count,bytes=Manifest.totalBytes}));return;}
   Application.Run(new SetupWindow());
  }catch(Exception e){if(args.Length>0){File.WriteAllText(Path.Combine(Root,"setup-error.txt"),e.ToString());Environment.ExitCode=1;}else MessageBox.Show(e.Message,"Tom setup",MessageBoxButtons.OK,MessageBoxIcon.Information);}
 }
 internal static string ResolveInside(string root,string relative){
  if(String.IsNullOrWhiteSpace(relative)||Path.IsPathRooted(relative)||relative.Contains(":"))throw new Exception("Invalid payload path.");
  string full=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar))),prefix=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
  if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new Exception("A payload path escaped its package.");return full;
 }
 internal static void Install(string target,bool integrate,Action<string,double> progress){
  target=Path.GetFullPath(target);if(target.StartsWith("\\\\"))throw new Exception("Choose a local folder for this package.");
  if(Directory.Exists(target)&&Directory.GetFileSystemEntries(target).Length>0)throw new Exception("Choose an empty Tom folder. This preview does not overwrite an existing installation.");
  string driveRoot=Path.GetPathRoot(target);if(new DriveInfo(driveRoot).AvailableFreeSpace<Manifest.totalBytes+1024L*1024*1024)throw new Exception("There is not enough disk space for E2B, its vision projector and installation headroom.");
  string staging=target+".installing-"+Guid.NewGuid().ToString("N");Directory.CreateDirectory(staging);long copied=0;bool committed=false;
  try{
   foreach(var entry in Manifest.files){
    string source=ResolveInside(Payload,entry.path),dest=ResolveInside(staging,entry.path);var info=new FileInfo(source);if(!info.Exists||info.Length!=entry.bytes)throw new Exception("A package file is missing or incomplete: "+entry.path);
    Directory.CreateDirectory(Path.GetDirectoryName(dest));using(var hash=SHA256.Create())using(var input=new FileStream(source,FileMode.Open,FileAccess.Read,FileShare.Read))using(var output=new FileStream(dest,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
     byte[] buffer=new byte[262144];int n;long last=Environment.TickCount;while((n=input.Read(buffer,0,buffer.Length))>0){output.Write(buffer,0,n);hash.TransformBlock(buffer,0,n,null,0);copied+=n;if(Environment.TickCount-last>100){last=Environment.TickCount;progress("Copying and checking "+entry.path,(double)copied/Manifest.totalBytes);}}
     hash.TransformFinalBlock(new byte[0],0,0);output.Flush(true);string actual=BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant();if(actual!=entry.sha256)throw new Exception("A package checksum failed: "+entry.path);
    }
   }
   File.WriteAllText(Path.Combine(staging,"installation.json"),Json.Serialize(new {version=Manifest.version,installed=DateTime.UtcNow.ToString("o"),portable=!integrate,firstRunCheck=true}));
   if(Directory.Exists(target))Directory.Delete(target,false);Directory.Move(staging,target);committed=true;
   Directory.CreateDirectory(Path.Combine(target,".state"));
   try{if(integrate){progress("Adding Ask Tom to this Windows account",.99);var p=Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(target,"scripts","integrate-windows.ps1")+"\""){WorkingDirectory=target,UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardOutput=true});string error=p.StandardError.ReadToEnd();p.StandardOutput.ReadToEnd();p.WaitForExit();if(p.ExitCode!=0)throw new Exception("Tom's files are installed, but the Windows shortcuts could not be added. "+error);}}catch(Exception e){File.WriteAllText(Path.Combine(target,".state","integration-warning.txt"),e.Message);progress("Files installed. Windows integration needs attention; see .state/integration-warning.txt.",1);return;}
   progress("Installed. Tom will check this computer when it opens.",1);
  }finally{if(!committed&&Directory.Exists(staging)){string checkedPath=Path.GetFullPath(staging);if(checkedPath.StartsWith(target+".installing-",StringComparison.OrdinalIgnoreCase))Directory.Delete(checkedPath,true);}}
 }
}
internal sealed class SetupWindow : Form {
 TextBox destination;Button install,browse,open;CheckBox portable;Label message;ProgressBar progress;
 internal SetupWindow(){
  Text="Install Tom";ClientSize=new Size(620,490);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;Font=new Font("Segoe UI",10);BackColor=Color.FromArgb(8,18,17);ForeColor=Color.FromArgb(227,242,233);
  Controls.Add(new Label{Text="Your AI. On this computer.",Font=new Font("Segoe UI",25),Location=new Point(30,26),Size=new Size(560,55)});
  Controls.Add(new Label{Text="Tom / Gemma 4 E2B + vision / CPU",ForeColor=Color.FromArgb(16,185,129),Location=new Point(32,89),Size=new Size(550,28)});
  Controls.Add(new Label{Text="1  Install E2B offline\n2  Measure this computer\n3  Choose an upgrade only if a local trial passes",Location=new Point(32,135),Size=new Size(550,82)});
  Controls.Add(new Label{Text="The complete offline payload is "+(TomSetup.Manifest.totalBytes/1073741824.0).ToString("0.00")+" GiB. No internet is needed to install it.",ForeColor=Color.FromArgb(140,165,155),Location=new Point(32,219),Size=new Size(550,38)});
  destination=new TextBox{Text=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Tom"),Location=new Point(32,269),Size=new Size(448,29),BackColor=Color.FromArgb(16,33,30),ForeColor=ForeColor};Controls.Add(destination);
  browse=Button("Choose…",491,266,96);browse.Click+=delegate{using(var folder=new FolderBrowserDialog{Description="Choose an empty folder for Tom"}){if(folder.ShowDialog()==DialogResult.OK)destination.Text=folder.SelectedPath;}};Controls.Add(browse);
  portable=new CheckBox{Text="Portable folder · skip Windows menus and shortcuts",Location=new Point(32,313),Size=new Size(555,30)};Controls.Add(portable);
  message=new Label{Text="E2B remains selected unless you approve a tested upgrade.",ForeColor=Color.FromArgb(140,165,155),Location=new Point(32,359),Size=new Size(550,41)};Controls.Add(message);
  progress=new ProgressBar{Location=new Point(32,401),Size=new Size(555,6),Style=ProgressBarStyle.Continuous};Controls.Add(progress);
  var licenses=Button("License notices",32,429,140);licenses.Click+=delegate{Process.Start(new ProcessStartInfo("notepad.exe","\""+Path.Combine(TomSetup.Payload,"THIRD_PARTY_NOTICES.md")+"\""){UseShellExecute=false});};Controls.Add(licenses);
  install=Button("Install Tom",432,429,155);install.BackColor=Color.FromArgb(16,185,129);install.ForeColor=BackColor;install.Click+=async delegate{install.Enabled=false;browse.Enabled=false;destination.Enabled=false;portable.Enabled=false;string target=destination.Text;bool integrate=!portable.Checked;try{await Task.Run(()=>TomSetup.Install(target,integrate,(text,fraction)=>{BeginInvoke((Action)delegate{message.Text=text;progress.Value=Math.Max(0,Math.Min(100,(int)(fraction*100)));});}));install.Visible=false;open.Visible=true;message.Text="Installed. Tom is opening its first local check.";Process.Start(new ProcessStartInfo(Path.Combine(target,"Start-Tom.exe")){WorkingDirectory=target,UseShellExecute=false,CreateNoWindow=true});}catch(Exception e){message.Text=e.Message;install.Enabled=true;browse.Enabled=true;destination.Enabled=true;portable.Enabled=true;}};Controls.Add(install);
  open=Button("Open Tom",432,429,155);open.Visible=false;open.BackColor=Color.FromArgb(16,185,129);open.ForeColor=BackColor;open.Click+=delegate{Process.Start(new ProcessStartInfo(Path.Combine(destination.Text,"Start-Tom.exe")){WorkingDirectory=destination.Text,UseShellExecute=false});Close();};Controls.Add(open);
  FormClosing+=delegate(object sender,FormClosingEventArgs e){if(!install.Enabled&&install.Visible){e.Cancel=true;message.Text="Let the current file operation finish before closing setup.";}};
 }
 Button Button(string text,int x,int y,int width){return new Button{Text=text,Location=new Point(x,y),Size=new Size(width,35),BackColor=Color.FromArgb(16,33,30),ForeColor=ForeColor,FlatStyle=FlatStyle.Flat};}
}
