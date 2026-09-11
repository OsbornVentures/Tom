using System;
using System.Drawing;
using System.Windows.Forms;
internal static class SetupLayout {
 [STAThread] static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  TomSetup.Manifest=new PayloadManifest{version="0.5.2",mode="offline",totalBytes=5300000000};
  using(var form=new SetupWindow()){
   form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.Show();Application.DoEvents();
   bool found=false;foreach(Control control in form.Controls){if(control is TextBox&&control.AccessibleName=="What should Tom call you?"){found=true;if(control.Text!=Environment.UserName)throw new Exception("Windows name was not prefilled");}if(control.Visible&&(control.Bottom>form.ClientSize.Height||control.Right>form.ClientSize.Width))throw new Exception("Setup content exceeds the window: "+control.Text);}
   if(!found)throw new Exception("Preferred-name input is missing");
   using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,bitmap.Size));bitmap.Save(args[0]);}
  }
  Console.WriteLine("PASS: setup name is prefilled and all controls fit the window.");
 }
}
