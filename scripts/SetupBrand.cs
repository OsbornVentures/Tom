using System;
using System.Drawing;
using System.Windows.Forms;
internal class BrandWindow : Form {
 internal static Color Ink=Color.FromArgb(8,18,17),Paper=Color.FromArgb(227,242,233),Muted=Color.FromArgb(148,173,160),Green=Color.FromArgb(16,185,129);
 internal BrandWindow(){Text="Tom setup";ClientSize=new Size(680,590);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;AutoScaleMode=AutoScaleMode.Dpi;Font=new Font("Segoe UI",10);BackColor=Ink;ForeColor=Paper;try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{} }
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;using(var pen=new Pen(Green,2))g.DrawRectangle(pen,36,34,48,48);using(var font=new Font("Consolas",13,FontStyle.Bold))using(var brush=new SolidBrush(Green))using(var format=new StringFormat{Alignment=StringAlignment.Center,LineAlignment=StringAlignment.Center})g.DrawString("o.o",font,brush,new RectangleF(36,33,48,43),format);using(var brush=new SolidBrush(Color.FromArgb(56,189,248)))for(int i=0;i<3;i++)g.FillEllipse(brush,52+i*7,72,2,2);using(var font=new Font("Segoe UI",34,FontStyle.Bold))using(var b=new SolidBrush(Paper))g.DrawString("Tom",font,b,99,22);using(var font=new Font("Segoe UI",34,FontStyle.Bold))using(var b=new SolidBrush(Green))g.DrawString(".",font,b,205,22);}
 internal Label LabelAt(string text,int x,int y,int width,int height,float size,Color color){var l=new Label{Text=text,Location=new Point(x,y),Size=new Size(width,height),Font=new Font("Segoe UI",size),ForeColor=color};Controls.Add(l);return l;}
 internal Button ButtonAt(string text,int x,int y,int width,bool primary){var b=new Button{Text=text,Location=new Point(x,y),Size=new Size(width,39),FlatStyle=FlatStyle.Flat,BackColor=primary?Green:Color.FromArgb(16,33,30),ForeColor=primary?Ink:Paper};b.FlatAppearance.BorderColor=primary?Green:Color.FromArgb(48,72,60);Controls.Add(b);return b;}
}
