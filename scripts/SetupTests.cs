using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Collections.Generic;
internal static class SetupTests {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static void Reject(Action action){bool threw=false;try{action();}catch{threw=true;}Check(threw,"Expected refusal");}
 static string Hash(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static void Main(string[] args){
  string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
  Check(TomSetup.ReadPreferredName(root)==Environment.UserName,"Windows name was not prefilled");
  Check(TomSetup.NormalizeName("  Renée  ")=="Renée","Name trimming failed");
  foreach(string name in new[]{"",new string('a',61),"Sam\nInstructions"})Reject(()=>TomSetup.NormalizeName(name));
  TomSetup.WritePreferredName(root,"Sam");Check(TomSetup.ReadPreferredName(root)=="Sam","Preferred name was not retained");
  foreach(string value in new[]{"../escape.txt","C:/outside.txt",".state/../escape","folder/./x","folder/file. ","a:b"})Reject(()=>TomSetup.ResolveInside(root,value));
  Check(TomSetup.ResolveInside(root,"folder/café.txt").StartsWith(root),"Unicode path failed");
  byte[] bytes=Encoding.UTF8.GetBytes("Tom verified bytes");
  TomSetup.CopyVerified(new MemoryStream(bytes),Path.Combine(root,"verified"),bytes.Length,Hash(bytes),n=>{},()=>false);
  Reject(()=>TomSetup.CopyVerified(new MemoryStream(bytes),Path.Combine(root,"corrupt"),bytes.Length,new string('0',64),n=>{},()=>false));
  Reject(()=>TomSetup.CopyVerified(new MemoryStream(bytes),Path.Combine(root,"overflow"),bytes.Length-1,Hash(bytes),n=>{},()=>false));
  Reject(()=>TomSetup.CopyVerified(new MemoryStream(bytes),Path.Combine(root,"cancelled"),bytes.Length,Hash(bytes),n=>{},()=>true));
  string target=Path.Combine(root,"target"),stage=Path.Combine(root,"staging"),backup=Path.Combine(root,"backup");Directory.CreateDirectory(target);Directory.CreateDirectory(stage);
  File.WriteAllText(Path.Combine(target,"a.txt"),"old");File.WriteAllText(Path.Combine(target,"notes.txt"),"personal");Directory.CreateDirectory(Path.Combine(target,".state"));File.WriteAllText(Path.Combine(target,".state","conversation"),"keep");
  File.WriteAllText(Path.Combine(stage,"a.txt"),"new");File.WriteAllText(Path.Combine(stage,"b.txt"),"new");
  // An existing directory blocks a later file. Earlier replacements must roll back.
  Directory.CreateDirectory(Path.Combine(target,"b.txt"));Reject(()=>TomSetup.CommitRepair(stage,backup,target));Check(File.ReadAllText(Path.Combine(target,"a.txt"))=="old","Rollback lost old file");Check(File.ReadAllText(Path.Combine(target,"notes.txt"))=="personal","Lost personal file");Check(File.ReadAllText(Path.Combine(target,".state","conversation"))=="keep","Lost conversation");
  string stage2=Path.Combine(root,"staging2"),backup2=Path.Combine(root,"backup2");Directory.CreateDirectory(stage2);File.WriteAllText(Path.Combine(stage2,"a.txt"),"repaired");TomSetup.CommitRepair(stage2,backup2,target);Check(File.ReadAllText(Path.Combine(target,"a.txt"))=="repaired","Repair failed");Check(File.ReadAllText(Path.Combine(target,"notes.txt"))=="personal","Repair lost personal file");
  Console.WriteLine("PASS: path containment, Unicode, corruption, size limits, cancellation, repair rollback and retained user files.");
 }
}
