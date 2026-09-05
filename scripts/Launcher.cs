using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Net;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows.Automation;

internal static class TomLauncher {
  internal static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
  internal static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=12000000 };
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [STAThread] private static void Main(string[] args) {
    SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
    try {
      Directory.CreateDirectory(Path.Combine(Root,".state"));
      if(args.Length>0&&args[0]=="--resident") { bool created;using(Mutex mutex=new Mutex(true,"Local\\Tom.Desktop.Helper",out created)){if(!created)return;Application.Run(new TomResident());}return; }
      EnsureService();StartResident();
      if(args.Length>1&&(args[0]=="--ask-file"||args[0]=="--ask-folder"||args[0]=="--draft-file")) {
        string item=Path.GetFullPath(args[1]);if(!File.Exists(item)&&!Directory.Exists(item))throw new Exception("This file or folder is no longer available.");
        string quote="Selected Windows "+(Directory.Exists(item)?"folder":"file")+":\n"+item;
        if(args[0]=="--draft-file"){string id=Draft("Help me understand this file.",quote,null);File.WriteAllText(Path.Combine(Root,".state","last-native-draft.json"),Json.Serialize(new {id=id}));return;}
        Application.Run(new AskWindow(quote,null));return;
      }
      if(args.Length>0&&args[0]=="--ask"){Application.Run(new AskWindow("",null));return;}
      Open(null);
    }catch(Exception e){MessageBox.Show(e.Message,"Tom couldn't open",MessageBoxButtons.OK,MessageBoxIcon.Information);}
  }
  internal static void StartResident(){Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--resident"){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root});}
  internal static string EnsureService(){
    using(Mutex start=new Mutex(false,"Local\\Tom.Service.Start")){
      try{if(!start.WaitOne(15000))throw new Exception("Tom is already starting. Try opening it again shortly.");}catch(AbandonedMutexException){}
      try{
        string url=ReadSession();if(url!=null)return url;
        string node=Path.Combine(Root,"runtime","node.exe"),server=Path.Combine(Root,"src","server.mjs");
        if(!File.Exists(node)||!File.Exists(server))throw new Exception("Keep Start-Tom.exe beside Tom's application folders.");
        Process child=Process.Start(new ProcessStartInfo(node,"\""+server+"\""){WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true});
        for(int i=0;i<150;i++){Thread.Sleep(100);url=ReadSession(child.Id);if(url!=null)return url;if(child.HasExited)throw new Exception("Tom could not start. Port 4317 may already be in use.");}
        throw new Exception("Tom did not start within fifteen seconds.");
      }finally{try{start.ReleaseMutex();}catch(ApplicationException){}}
    }
  }
  static string ReadSession(int expected=0){try{
    var data=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(Root,".state","session.json")));
    int pid=Convert.ToInt32(data["pid"]);if(expected!=0&&pid!=expected)return null;
    using(Process p=Process.GetProcessById(pid)){if(p.HasExited||p.ProcessName!="node")return null;}
    string url=(string)data["url"];Uri uri=new Uri(url);if(uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port!=4317||!uri.Fragment.StartsWith("#key="))return null;
    var probe=(HttpWebRequest)WebRequest.Create(uri.GetLeftPart(UriPartial.Authority)+"/api/state");probe.Headers["X-Tom-Key"]=uri.Fragment.Substring(5);probe.Timeout=1000;probe.Proxy=null;using(var response=probe.GetResponse()){return url;}
  }catch{return null;}}
  internal static Dictionary<string,object> Post(string route,object data){
    Uri uri=new Uri(EnsureService());byte[] bytes=Encoding.UTF8.GetBytes(Json.Serialize(data));
    HttpWebRequest req=(HttpWebRequest)WebRequest.Create(uri.GetLeftPart(UriPartial.Authority)+"/api/"+route);
    req.Method="POST";req.ContentType="application/json";req.Headers["X-Tom-Key"]=uri.Fragment.Substring(5);req.Timeout=10000;req.Proxy=null;req.ContentLength=bytes.Length;
    using(Stream stream=req.GetRequestStream())stream.Write(bytes,0,bytes.Length);
    try{using(WebResponse response=req.GetResponse())using(StreamReader reader=new StreamReader(response.GetResponseStream()))return Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());}
    catch(WebException e){if(e.Response!=null)using(StreamReader r=new StreamReader(e.Response.GetResponseStream())){var error=Json.Deserialize<Dictionary<string,object>>(r.ReadToEnd());throw new Exception(Convert.ToString(error["error"]));}throw;}
  }
  internal static string Draft(string text,string quote,string image){return Convert.ToString(Post("drafts",new {text=text,quote=quote,images=image==null?new string[0]:new string[]{image}})["id"]);}
  internal static string ModelName(){try{return Convert.ToString(Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(Root,".state","identity.json")))["name"]);}catch{return "Gemma 4 E2B";}}
  internal static void Open(string draft){OpenView(draft==null?null:"draft",draft);}
  internal static void OpenView(string kind,string value){string url=EnsureService();if(value!=null)url+="&"+kind+"="+Uri.EscapeDataString(value);
    string edge=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Microsoft","Edge","Application","msedge.exe");
    if(!File.Exists(edge))edge=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Microsoft","Edge","Application","msedge.exe");
    if(File.Exists(edge))Process.Start(new ProcessStartInfo(edge,"--app=\""+url+"\" --user-data-dir=\""+Path.Combine(Root,".state","browser-profile")+"\" --no-first-run"){UseShellExecute=false});
    else Process.Start(new ProcessStartInfo(url){UseShellExecute=true});
  }
  internal static string Selection(){try{AutomationElement focused=AutomationElement.FocusedElement;object pattern;if(focused!=null&&focused.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){
    var ranges=((TextPattern)pattern).GetSelection();StringBuilder text=new StringBuilder();foreach(var range in ranges){text.Append(range.GetText(Math.Max(0,8000-text.Length)));if(text.Length>=8000)break;}return text.ToString();}
  }catch{}return "";}
  internal static Color Bg=Color.FromArgb(8,18,17),Panel=Color.FromArgb(16,33,30),Text=Color.FromArgb(227,242,233),Muted=Color.FromArgb(140,165,155),Emerald=Color.FromArgb(16,185,129);
  internal static Button Button(string title,int x,int y,int width){return new Button{Text=title,Location=new Point(x,y),Size=new Size(width,36),FlatStyle=FlatStyle.Flat,BackColor=Panel,ForeColor=Text,TabStop=true};}
}

internal sealed class TomResident : ApplicationContext {
  NotifyIcon tray;HotkeyWindow hotkey;Icon icon;AskWindow popup;
  internal TomResident(){
    icon=KernelIcon();tray=new NotifyIcon{Icon=icon,Text="Tom · Ask with Ctrl Alt T",Visible=true};var menu=new ContextMenuStrip();
    menu.Items.Add("Open Tom",null,delegate{Safe(delegate{TomLauncher.Open(null);});});menu.Items.Add("Ask Tom · Ctrl Alt T",null,delegate{ShowAsk("");});
    menu.Items.Add("Ask with a screenshot",null,delegate{ShowAsk("");popup.CaptureRegion();});menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Quit Tom",null,delegate{Safe(delegate{TomLauncher.Post("quit",new {});});ExitThread();});tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{ShowAsk("");};
    hotkey=new HotkeyWindow(delegate{ShowAsk(TomLauncher.Selection());});Status(true);
  }
  void Safe(Action action){try{action();}catch(Exception e){MessageBox.Show(e.Message,"Tom");}}
  void ShowAsk(string selection){if(popup!=null&&!popup.IsDisposed){popup.Activate();return;}popup=new AskWindow(selection,null);popup.Show();popup.Activate();}
  void Status(bool running){try{File.WriteAllText(Path.Combine(TomLauncher.Root,".state","native-status.json"),TomLauncher.Json.Serialize(new {pid=Process.GetCurrentProcess().Id,running=running,hotkeyRegistered=running&&hotkey.Registered,shortcut="Ctrl Alt T",version="0.4.0"}));}catch{}}
  protected override void ExitThreadCore(){Status(false);hotkey.Dispose();tray.Visible=false;tray.Dispose();icon.Dispose();base.ExitThreadCore();}
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
  static Icon KernelIcon(){using(Bitmap b=new Bitmap(32,32)){using(Graphics g=Graphics.FromImage(b)){g.Clear(Color.Transparent);using(Pen p=new Pen(TomLauncher.Emerald,2)){g.DrawRectangle(p,4,4,24,24);}using(Brush brush=new SolidBrush(TomLauncher.Emerald)){g.FillRectangle(brush,10,10,4,4);g.FillRectangle(brush,18,10,4,4);g.FillRectangle(brush,10,18,4,4);g.FillRectangle(brush,18,18,4,4);}}IntPtr h=b.GetHicon();Icon copy=(Icon)Icon.FromHandle(h).Clone();DestroyIcon(h);return copy;}}
}
internal sealed class HotkeyWindow : NativeWindow,IDisposable {
  [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterHotKey(IntPtr h,int id,uint mods,uint key);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
  internal bool Registered;Action callback;
  internal HotkeyWindow(Action action){callback=action;CreateHandle(new CreateParams());Registered=RegisterHotKey(Handle,1,0x4003,0x54);}
  protected override void WndProc(ref Message m){if(m.Msg==0x312)callback();base.WndProc(ref m);}
  public void Dispose(){if(Registered)UnregisterHotKey(Handle,1);DestroyHandle();}
}
internal sealed class AskWindow : Form {
  TextBox question,context;Label imageLabel;string image;
  internal AskWindow(string quote,string screenshot){
    Text="Ask Tom";ClientSize=new Size(520,355);MinimumSize=Size;MaximumSize=Size;StartPosition=FormStartPosition.CenterScreen;BackColor=TomLauncher.Bg;ForeColor=TomLauncher.Text;Font=new Font("Segoe UI",10);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;KeyPreview=true;
    Controls.Add(new Label{Text="Tom",Font=new Font("Segoe UI",22,FontStyle.Bold),Location=new Point(22,15),Size=new Size(100,45)});
    Controls.Add(new Label{Text=TomLauncher.ModelName()+" / LOCAL",ForeColor=TomLauncher.Muted,Location=new Point(145,33),Size=new Size(270,25)});
    question=new TextBox{Multiline=true,Location=new Point(24,76),Size=new Size(472,68),BackColor=TomLauncher.Panel,ForeColor=TomLauncher.Text,BorderStyle=BorderStyle.FixedSingle,MaxLength=8000,Text="Help me understand this."};Controls.Add(question);
    context=new TextBox{Multiline=true,Location=new Point(24,155),Size=new Size(472,80),BackColor=TomLauncher.Panel,ForeColor=TomLauncher.Muted,BorderStyle=BorderStyle.FixedSingle,ScrollBars=ScrollBars.Vertical,MaxLength=8000,Text=quote};Controls.Add(context);
    imageLabel=new Label{Text=quote.Length>0?"Selected context attached. You can edit it above.":"No selected text available. Type a subject or paste context.",ForeColor=TomLauncher.Muted,Location=new Point(24,243),Size=new Size(472,32)};Controls.Add(imageLabel);
    var paste=TomLauncher.Button("Paste",24,286,65);paste.Click+=delegate{try{if(Clipboard.ContainsText())context.Text=Clipboard.GetText().Substring(0,Math.Min(8000,Clipboard.GetText().Length));}catch(Exception e){Error(e);}};Controls.Add(paste);
    var capture=TomLauncher.Button("Screenshot",96,286,103);capture.Click+=delegate{CaptureRegion();};Controls.Add(capture);
    var web=TomLauncher.Button("Web search",206,286,104);web.Click+=delegate{try{string query=context.Text.Trim().Length>0?context.Text:question.Text;if(query.Length>2000)query=query.Substring(0,2000);var result=TomLauncher.Post("research",new {query=query,images=image==null?new string[0]:new string[]{image}});TomLauncher.OpenView("task",Convert.ToString(result["id"]));Close();}catch(Exception e){Error(e);}};Controls.Add(web);
    var send=TomLauncher.Button("Open in Tom",327,286,169);send.BackColor=TomLauncher.Emerald;send.ForeColor=TomLauncher.Bg;send.Click+=delegate{try{string id=TomLauncher.Draft(question.Text,context.Text,image);TomLauncher.Open(id);Close();}catch(Exception e){Error(e);}};Controls.Add(send);AcceptButton=send;
    KeyDown+=delegate(object sender,KeyEventArgs e){if(e.KeyCode==Keys.Escape)Close();};Shown+=delegate{question.Focus();question.SelectAll();};image=screenshot;
  }
  void Error(Exception e){MessageBox.Show(this,e.Message,"Ask Tom",MessageBoxButtons.OK,MessageBoxIcon.Information);}
  internal void CaptureRegion(){try{Hide();Application.DoEvents();using(var picker=new RegionPicker()){if(picker.ShowDialog()==DialogResult.OK){image=picker.ImageData;imageLabel.Text="Screenshot attached. Only your chosen region will be sent.";}}}catch(Exception e){Error(e);}finally{Show();Activate();}}
}
internal sealed class RegionPicker : Form {
  Bitmap screen;Point start;Rectangle selection;bool dragging;internal string ImageData;
  internal RegionPicker(){Bounds=SystemInformation.VirtualScreen;StartPosition=FormStartPosition.Manual;FormBorderStyle=FormBorderStyle.None;TopMost=true;ShowInTaskbar=false;Cursor=Cursors.Cross;DoubleBuffered=true;KeyPreview=true;
    screen=new Bitmap(Bounds.Width,Bounds.Height);using(Graphics g=Graphics.FromImage(screen))g.CopyFromScreen(Bounds.Location,Point.Empty,Bounds.Size);
    MouseDown+=delegate(object sender,MouseEventArgs e){if(e.Button!=MouseButtons.Left)return;start=e.Location;dragging=true;};
    MouseMove+=delegate(object sender,MouseEventArgs e){if(!dragging)return;selection=Rectangle.FromLTRB(Math.Min(start.X,e.X),Math.Min(start.Y,e.Y),Math.Max(start.X,e.X),Math.Max(start.Y,e.Y));Invalidate();};
    MouseUp+=delegate{if(!dragging||selection.Width<4||selection.Height<4){DialogResult=DialogResult.Cancel;return;}dragging=false;double scale=Math.Min(1.0,1280.0/Math.Max(selection.Width,selection.Height));using(Bitmap crop=new Bitmap(Math.Max(1,(int)(selection.Width*scale)),Math.Max(1,(int)(selection.Height*scale)))){using(Graphics g=Graphics.FromImage(crop)){g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(screen,new Rectangle(0,0,crop.Width,crop.Height),selection,GraphicsUnit.Pixel);}using(MemoryStream bytes=new MemoryStream()){crop.Save(bytes,ImageFormat.Jpeg);ImageData="data:image/jpeg;base64,"+Convert.ToBase64String(bytes.ToArray());}}DialogResult=DialogResult.OK;};
    KeyDown+=delegate(object sender,KeyEventArgs e){if(e.KeyCode==Keys.Escape)DialogResult=DialogResult.Cancel;};
  }
  protected override void OnPaint(PaintEventArgs e){e.Graphics.DrawImageUnscaled(screen,0,0);using(Brush shade=new SolidBrush(Color.FromArgb(125,0,12,8)))e.Graphics.FillRectangle(shade,ClientRectangle);if(selection.Width>0&&selection.Height>0){e.Graphics.DrawImage(screen,selection,selection,GraphicsUnit.Pixel);using(Pen pen=new Pen(TomLauncher.Emerald,2))e.Graphics.DrawRectangle(pen,selection);}using(Font font=new Font("Segoe UI",13))e.Graphics.DrawString("Drag to attach a region · Esc to cancel",font,Brushes.White,24,24);}
  protected override void Dispose(bool disposing){if(disposing&&screen!=null)screen.Dispose();base.Dispose(disposing);}
}
