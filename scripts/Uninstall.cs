using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Threading.Tasks;
using System.Collections.Generic;

internal static class TomUninstall {
 [STAThread] static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  try{
   if(args.Length<2||args[0]!="--remove"){
    string root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
    if(MessageBox.Show("Remove Tom from this computer? Your conversations, preferences, and personal files will be kept in the Tom folder.","Uninstall Tom",MessageBoxButtons.OKCancel,MessageBoxIcon.Question)!=DialogResult.OK)return;
    string temp=Path.Combine(Path.GetTempPath(),"Tom-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");File.Copy(Application.ExecutablePath,temp);
    Process.Start(new ProcessStartInfo(temp,"--remove \""+root+"\""){UseShellExecute=false,CreateNoWindow=true});return;
   }
   string target=Path.GetFullPath(args[1]).TrimEnd('\\');Remove(target);
   if(args.Length<3||args[2]!="--test")MessageBox.Show("Tom has been removed. Your conversations and personal files are still in:\n"+target,"Tom",MessageBoxButtons.OK,MessageBoxIcon.Information);
  }catch(Exception e){Environment.ExitCode=1;if(args.Length>2&&args[2]=="--test")File.WriteAllText(Path.Combine(Path.GetTempPath(),"tom-uninstall-error.txt"),e.ToString());else MessageBox.Show(e.Message,"Tom could not be removed",MessageBoxButtons.OK,MessageBoxIcon.Information);}
 }
 internal static void Remove(string target){
  TomSetup.NoLinks(target);if(!TomSetup.Existing(target))throw new Exception("This is not a Tom installation.");TomSetup.NotRunning(target);
  var manifest=TomSetup.Json.Deserialize<PayloadManifest>(File.ReadAllText(Path.Combine(target,"installed-manifest.json")));TomSetup.ValidateManifest(manifest);
  // Validate every destination before deleting any files. Personal .state files
  // are never part of a shipping manifest and are always retained.
  foreach(var entry in manifest.files){string file=TomSetup.ResolveInside(target,entry.path);TomSetup.NoLinks(Path.GetDirectoryName(file));if(File.Exists(file)&&(File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new Exception("A program file is a link. Uninstall stopped.");}
  var installed=TomSetup.Json.Deserialize<Installation>(File.ReadAllText(Path.Combine(target,"installation.json")));
  if(!installed.portable)TomSetup.Integrate(target,true);
  foreach(var entry in manifest.files){string file=TomSetup.ResolveInside(target,entry.path);if(File.Exists(file))File.Delete(file);}
  File.Delete(Path.Combine(target,"installed-manifest.json"));File.Delete(Path.Combine(target,"installation.json"));
  var owned=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(var entry in manifest.files){string directory=Path.GetDirectoryName(TomSetup.ResolveInside(target,entry.path));while(directory!=target){owned.Add(directory);directory=Path.GetDirectoryName(directory);}}
  var directories=new List<string>(owned);directories.Sort((a,b)=>b.Length.CompareTo(a.Length));
  foreach(string directory in directories)if(Directory.Exists(directory)&&(File.GetAttributes(directory)&FileAttributes.ReparsePoint)==0&&Directory.GetFileSystemEntries(directory).Length==0)Directory.Delete(directory,false);
 }
}
