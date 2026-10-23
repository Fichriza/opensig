// OpenSig installer: one exe carrying OpenSig.exe (gzip-compressed). It installs for the current user (no
// administrator rights needed) or, when started as administrator, for all users; adds Start menu and desktop
// shortcuts, optionally opens .osw workspaces and .osgeo geometries with OpenSig, and registers an uninstaller in
// Settings ▸ Apps. The same exe, copied into the install folder as "Uninstall OpenSig.exe", removes it again.
// Built by build-installer.ps1 with the C# 5 compiler of .NET Framework 4.x (no SDK needed).
//
// Command line:  /S  silent · /D=<folder>  install folder · /NODESKTOP · /NOSTARTMENU · /NOASSOC · /LAUNCH
//                /UNINSTALL [/S] [/PURGE: also remove settings]
//   exit code 0 = done, 1 = failed (silent: the reason is appended to %TEMP%\OpenSig-Setup.log), 2 = OpenSig is running
//   for testing: /NOREG  no registry entries · /REGTEST=<key>  all registry entries under HKCU\<key> instead
//                /SHORTCUTDIR=<folder>  shortcuts there instead of Start menu / desktop
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class Options
{
    public string Dir, ShortcutDir;
    public bool Silent, Uninstall, Purge, Launch, AllUsers;
    public bool Desktop = true, StartMenu = true, Assoc = true, Register = true;
}

static class Setup
{
    public const string AppName = "OpenSig", AppExe = "OpenSig.exe", UninstExe = "Uninstall OpenSig.exe", LogName = "uninstall.log";
    const string UninstKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenSig";
    const string WebView2Url = "https://developer.microsoft.com/microsoft-edge/webview2/";
    static readonly string[,] FileTypes = { { ".osw", "OpenSig.Workspace", "OpenSig workspace" }, { ".osgeo", "OpenSig.Geometry", "OpenSig geometry" } };

    static string RegBase = "";                    // "" normally; a test key prefix with /REGTEST
    [DllImport("shell32.dll")] static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);

    [STAThread]
    static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Options o = new Options();
        o.AllUsers = IsAdmin();
        foreach (string a in args)
        {
            string u = a.ToUpperInvariant();
            if (u == "/S") o.Silent = true;
            else if (u == "/UNINSTALL") o.Uninstall = true;
            else if (u == "/PURGE") o.Purge = true;
            else if (u == "/LAUNCH") o.Launch = true;
            else if (u == "/NODESKTOP") o.Desktop = false;
            else if (u == "/NOSTARTMENU") o.StartMenu = false;
            else if (u == "/NOASSOC") o.Assoc = false;
            else if (u == "/NOREG") { o.Register = false; o.Assoc = false; }
            else if (u.StartsWith("/D=")) o.Dir = a.Substring(3).Trim('"');
            else if (u.StartsWith("/SHORTCUTDIR=")) o.ShortcutDir = a.Substring(13).Trim('"');
            else if (u.StartsWith("/REGTEST=")) { RegBase = a.Substring(9).Trim('"', '\\') + "\\"; o.AllUsers = false; }
            else if (u == "/?" || u == "/HELP")
            {
                MessageBox.Show("OpenSig Setup " + Info.Version + "\n\n/S\tsilent\n/D=<folder>\tinstall folder\n/NODESKTOP\tno desktop shortcut\n/NOSTARTMENU\tno Start menu entry\n" +
                    "/NOASSOC\tdo not open .osw / .osgeo files with OpenSig\n/LAUNCH\tstart OpenSig afterwards\n/UNINSTALL\tremove OpenSig (/PURGE: also its settings)", "OpenSig Setup");
                return 0;
            }
        }
        if (!Environment.Is64BitOperatingSystem) { Fail(o, "OpenSig needs 64-bit Windows 10 or 11."); return 1; }
        try
        {
            if (o.Uninstall) return RunUninstall(o);
            if (o.Dir == null) { string v; bool all; string inst = Installed(out v, out all); if (inst != null) { o.Dir = inst; o.AllUsers = all; } else o.Dir = DefaultDir(o.AllUsers); } // an update keeps its place
            if (o.Silent)
            {
                if (RunningFrom(o.Dir)) { Fail(o, "OpenSig is running from " + o.Dir + "."); return 2; }
                Install(o, null); if (o.Launch) Launch(o.Dir); return 0;
            }
            Application.Run(new SetupForm(o));
            return 0;
        }
        catch (Exception ex) { Fail(o, ex.Message); return 1; }
    }

    static void Fail(Options o, string msg)
    {
        if (o.Silent) { try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "OpenSig-Setup.log"), DateTime.Now.ToString("s") + "  " + msg + Environment.NewLine); } catch (Exception) { } } // no window in silent mode
        else MessageBox.Show(msg, "OpenSig Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    public static bool IsAdmin()
    {
        try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
        catch (Exception) { return false; }
    }
    public static string DefaultDir(bool allUsers)
    {
        return allUsers ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), AppName)
                        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", AppName);
    }
    // an earlier installation: its folder, version and whether it is for all users (current user first)
    public static string Installed(out string version, out bool allUsers)
    {
        version = null; allUsers = false;
        foreach (RegistryKey root in new[] { Registry.CurrentUser, Registry.LocalMachine })
            using (RegistryKey k = root.OpenSubKey(RegBase + UninstKey))
                if (k != null)
                {
                    string dir = k.GetValue("InstallLocation") as string;
                    if (!string.IsNullOrEmpty(dir) && File.Exists(Path.Combine(dir, AppExe))) { version = k.GetValue("DisplayVersion") as string; allUsers = root == Registry.LocalMachine; return dir; }
                }
        return null;
    }
    public static bool HasWebView2()
    {
        const string g = @"\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        string[] lm = { @"SOFTWARE\WOW6432Node" + g, @"SOFTWARE" + g };
        foreach (string p in lm) if (VersionAt(Registry.LocalMachine, p)) return true;
        return VersionAt(Registry.CurrentUser, @"Software" + g);
    }
    static bool VersionAt(RegistryKey root, string path)
    {
        using (RegistryKey k = root.OpenSubKey(path))
        {
            string v = k == null ? null : k.GetValue("pv") as string;
            return !string.IsNullOrEmpty(v) && v != "0.0.0.0";
        }
    }
    public static string WebView2Page { get { return WebView2Url; } }

    // OpenSig.exe started from this folder (it must be closed before its file can be replaced)
    public static bool RunningFrom(string dir)
    {
        string exe = Path.GetFullPath(Path.Combine(dir, AppExe));
        foreach (Process p in Process.GetProcessesByName("OpenSig"))
        {
            try { if (string.Equals(p.MainModule.FileName, exe, StringComparison.OrdinalIgnoreCase)) return true; }
            catch (Exception) { } // a process of another user
            finally { p.Dispose(); }
        }
        return false;
    }

    /* ---------------- install ---------------- */
    public static void Install(Options o, Action<int, string> progress)
    {
        if (progress == null) progress = delegate { };
        string dir = Path.GetFullPath(o.Dir), exe = Path.Combine(dir, AppExe);
        progress(5, "Preparing " + dir);
        if (RunningFrom(dir)) throw new IOException("OpenSig is running. Close it, then try again.");
        try { Directory.CreateDirectory(dir); string t = Path.Combine(dir, ".write-test"); File.WriteAllText(t, ""); File.Delete(t); }
        catch (UnauthorizedAccessException) { throw new UnauthorizedAccessException("Windows does not allow writing to " + dir + ".\n\nChoose a folder in your user profile, or start the setup as administrator (right-click ▸ Run as administrator)."); }
        List<string> log = new List<string> { "regbase\t" + RegBase };

        progress(15, "Copying OpenSig.exe");
        string tmp = exe + ".new";
        using (Stream src = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.OpenSig.exe.gz"))
        using (GZipStream z = new GZipStream(src, CompressionMode.Decompress))
        using (FileStream f = File.Create(tmp)) z.CopyTo(f);
        if (File.Exists(exe)) File.Delete(exe);
        File.Move(tmp, exe);
        log.Add("file\t" + exe);

        progress(55, "Adding the uninstaller");
        string self = Assembly.GetExecutingAssembly().Location, uninst = Path.Combine(dir, UninstExe);
        if (!string.Equals(Path.GetFullPath(self), uninst, StringComparison.OrdinalIgnoreCase)) File.Copy(self, uninst, true);
        log.Add("file\t" + uninst);

        progress(65, "Creating shortcuts");
        if (o.StartMenu)
        {
            string folder = o.ShortcutDir != null ? Path.Combine(o.ShortcutDir, "Start menu") : Environment.GetFolderPath(o.AllUsers ? Environment.SpecialFolder.CommonPrograms : Environment.SpecialFolder.Programs);
            Directory.CreateDirectory(folder);
            string lnk = Path.Combine(folder, AppName + ".lnk"); Shortcut(lnk, exe, dir); log.Add("shortcut\t" + lnk);
        }
        if (o.Desktop)
        {
            string folder = o.ShortcutDir != null ? Path.Combine(o.ShortcutDir, "Desktop") : Environment.GetFolderPath(o.AllUsers ? Environment.SpecialFolder.CommonDesktopDirectory : Environment.SpecialFolder.DesktopDirectory);
            Directory.CreateDirectory(folder);
            string lnk = Path.Combine(folder, AppName + ".lnk"); Shortcut(lnk, exe, dir); log.Add("shortcut\t" + lnk);
        }

        RegistryKey root = o.AllUsers ? Registry.LocalMachine : Registry.CurrentUser;
        string rootName = o.AllUsers ? "HKLM" : "HKCU";
        if (o.Assoc)
        {
            progress(75, "Registering .osw and .osgeo files");
            for (int i = 0; i < FileTypes.GetLength(0); i++)
            {
                string ext = FileTypes[i, 0], prog = FileTypes[i, 1];
                using (RegistryKey k = root.CreateSubKey(RegBase + @"Software\Classes\" + prog))
                {
                    k.SetValue("", FileTypes[i, 2]);
                    using (RegistryKey ic = k.CreateSubKey("DefaultIcon")) ic.SetValue("", "\"" + exe + "\",0");
                    using (RegistryKey c = k.CreateSubKey(@"shell\open\command")) c.SetValue("", "\"" + exe + "\" \"%1\"");
                }
                using (RegistryKey k = root.CreateSubKey(RegBase + @"Software\Classes\" + ext))
                {
                    k.SetValue("", prog);
                    using (RegistryKey w = k.CreateSubKey("OpenWithProgids")) w.SetValue(prog, new byte[0], RegistryValueKind.None);
                }
                log.Add("assoc\t" + rootName + "\t" + ext + "\t" + prog);
            }
            if (RegBase == "") SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero); // file types changed: refresh Explorer
        }
        if (o.Register)
        {
            progress(85, "Adding OpenSig to Settings ▸ Apps");
            using (RegistryKey k = root.CreateSubKey(RegBase + UninstKey))
            {
                k.SetValue("DisplayName", AppName);
                k.SetValue("DisplayVersion", Info.Version);
                k.SetValue("Publisher", AppName);
                k.SetValue("DisplayIcon", "\"" + exe + "\",0");
                k.SetValue("InstallLocation", dir);
                k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                k.SetValue("UninstallString", "\"" + uninst + "\" /UNINSTALL");
                k.SetValue("QuietUninstallString", "\"" + uninst + "\" /UNINSTALL /S");
                k.SetValue("EstimatedSize", (int)((new FileInfo(exe).Length + new FileInfo(uninst).Length) / 1024), RegistryValueKind.DWord);
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
            log.Add("uninstkey\t" + rootName);
        }
        File.WriteAllLines(Path.Combine(dir, LogName), log.ToArray(), Encoding.UTF8);
        progress(100, "Done");
    }

    static void Shortcut(string lnk, string target, string workDir)
    {
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        try
        {
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
            Type st = sc.GetType();
            st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { workDir });
            st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "OpenSig – signal analysis" });
            st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
            st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            Marshal.FinalReleaseComObject(sc);
        }
        finally { Marshal.FinalReleaseComObject(shell); }
    }

    public static void Launch(string dir)
    {
        string exe = Path.Combine(dir, AppExe);
        Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = dir, UseShellExecute = true });
    }

    /* ---------------- uninstall ---------------- */
    static int RunUninstall(Options o)
    {
        string self = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
        string dir = o.Dir != null ? Path.GetFullPath(o.Dir) : Path.GetDirectoryName(self);
        if (!File.Exists(Path.Combine(dir, LogName)) && !File.Exists(Path.Combine(dir, AppExe))) { Fail(o, "OpenSig is not installed in " + dir + "."); return 1; }
        if (!o.Silent)
        {
            if (MessageBox.Show("Remove OpenSig from this computer?\n\n" + dir, "Uninstall OpenSig", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return 0;
            o.Purge = MessageBox.Show("Also remove your OpenSig settings, recent files and cached data?\n\nChoose No to keep them for a later installation.",
                "Uninstall OpenSig", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }
        while (RunningFrom(dir))
        {
            if (o.Silent) { Fail(o, "OpenSig is running."); return 2; }
            if (MessageBox.Show("OpenSig is running. Close it, then click Retry.", "Uninstall OpenSig", MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning) != DialogResult.Retry) return 0;
        }
        Uninstall(dir, o.Purge, self);
        if (!o.Silent) MessageBox.Show("OpenSig has been removed.", "Uninstall OpenSig", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return 0;
    }

    public static void Uninstall(string dir, bool purge, string self)
    {
        string logFile = Path.Combine(dir, LogName);
        string[] lines = File.Exists(logFile) ? File.ReadAllLines(logFile) : new[] { "file\t" + Path.Combine(dir, AppExe), "file\t" + Path.Combine(dir, UninstExe) };
        bool selfInside = false, assoc = false;
        string regBase = "";
        foreach (string line in lines)
        {
            string[] f = line.Split('\t');
            try
            {
                if (f[0] == "regbase") { regBase = f.Length > 1 ? f[1] : ""; continue; }
                if ((f[0] == "file" || f[0] == "shortcut") && f.Length > 1)
                {
                    if (string.Equals(Path.GetFullPath(f[1]), self, StringComparison.OrdinalIgnoreCase)) { selfInside = true; continue; }
                    if (File.Exists(f[1])) File.Delete(f[1]);
                }
                else if (f[0] == "assoc" && f.Length > 3)
                {
                    RegistryKey root = f[1] == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser;
                    using (RegistryKey k = root.OpenSubKey(regBase + @"Software\Classes\" + f[2], true))
                        if (k != null)
                        {
                            if (k.GetValue("") as string == f[3]) k.DeleteValue("", false); // only if it still opens with OpenSig
                            using (RegistryKey w = k.OpenSubKey("OpenWithProgids", true)) if (w != null) w.DeleteValue(f[3], false);
                        }
                    root.DeleteSubKeyTree(regBase + @"Software\Classes\" + f[3], false);
                    using (RegistryKey k = root.OpenSubKey(regBase + @"Software\Classes\" + f[2]))
                        if (k != null && k.ValueCount == 0 && Array.TrueForAll(k.GetSubKeyNames(), n => n == "OpenWithProgids") && OpenEmpty(k))
                            root.DeleteSubKeyTree(regBase + @"Software\Classes\" + f[2], false); // the extension key, when nothing else is left in it
                    assoc = true;
                }
                else if (f[0] == "uninstkey" && f.Length > 1) (f[1] == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser).DeleteSubKeyTree(regBase + UninstKey, false);
            }
            catch (Exception) { } // remove as much as possible
        }
        if (assoc && regBase == "") SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
        try { if (File.Exists(logFile)) File.Delete(logFile); } catch (Exception) { }
        if (purge)
        {
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
            try { if (Directory.Exists(data)) Directory.Delete(data, true); } catch (Exception) { }
        }
        if (selfInside) // a running exe cannot delete itself: a hidden command does it a moment later (and the folder, if empty)
            Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 3 127.0.0.1 >nul & del /f /q \"" + self + "\" & rmdir \"" + dir + "\"")
                { CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, UseShellExecute = false });
        else { try { Directory.Delete(dir, false); } catch (Exception) { } } // only when empty: files of yours stay
    }

    static bool OpenEmpty(RegistryKey ext)
    {
        using (RegistryKey w = ext.OpenSubKey("OpenWithProgids")) return w == null || (w.ValueCount == 0 && w.SubKeyCount == 0);
    }

    // the OpenSig logo (blue circle, white wave), drawn at any size
    public static Bitmap Logo(int s)
    {
        Bitmap b = new Bitmap(s, s);
        using (Graphics g = Graphics.FromImage(b))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (LinearGradientBrush br = new LinearGradientBrush(new Point(0, 0), new Point(0, s), Color.FromArgb(40, 110, 230), Color.FromArgb(10, 50, 150)))
                g.FillEllipse(br, 0, 0, s - 1, s - 1);
            PointF[] pts = new PointF[61];
            for (int i = 0; i <= 60; i++) { double t = i / 60.0; pts[i] = new PointF((float)(s * (0.18 + 0.64 * t)), (float)(s * (0.5 - 0.25 * Math.Sin(t * 3 * Math.PI) * Math.Exp(-0.98 * t)))); }
            using (Pen p = new Pen(Color.White, Math.Max(1.2f, s / 13f)) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round }) g.DrawLines(p, pts);
        }
        return b;
    }
}

/* ---------------- the setup window ---------------- */
class SetupForm : Form
{
    readonly Options o;
    readonly Panel options = new Panel(), working = new Panel(), done = new Panel();
    readonly TextBox dirBox = new TextBox();
    readonly CheckBox desktop = new CheckBox(), startMenu = new CheckBox(), assoc = new CheckBox(), launch = new CheckBox();
    readonly ProgressBar bar = new ProgressBar();
    readonly Label status = new Label(), doneText = new Label();
    readonly Button next = new Button(), cancel = new Button();
    bool finished;

    public SetupForm(Options opts)
    {
        o = opts;
        SuspendLayout();
        Text = "OpenSig Setup";
        Font = SystemFonts.MessageBoxFont;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(560, 380);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

        // banner
        Panel head = new Panel { Bounds = new Rectangle(0, 0, 560, 76), BackColor = Color.White };
        PictureBox logo = new PictureBox { Bounds = new Rectangle(20, 14, 48, 48), Image = Setup.Logo(96), SizeMode = PictureBoxSizeMode.Zoom };
        Label title = new Label { Text = "OpenSig " + Info.Version, Font = new Font(Font.FontFamily, 14f, FontStyle.Bold), Bounds = new Rectangle(80, 14, 460, 28) };
        Label sub = new Label { Text = "Signal analysis with linked windows", ForeColor = Color.DimGray, Bounds = new Rectangle(82, 44, 460, 20) };
        head.Controls.AddRange(new Control[] { logo, title, sub });
        Label line = new Label { Bounds = new Rectangle(0, 76, 560, 1), BackColor = Color.Gainsboro };
        Controls.Add(head); Controls.Add(line);

        // page 1: where and what
        options.Bounds = new Rectangle(20, 90, 520, 230);
        string ver; bool allUsers; string existing = Setup.Installed(out ver, out allUsers);
        if (existing != null && !string.Equals(Path.GetFullPath(existing), Path.GetFullPath(o.Dir), StringComparison.OrdinalIgnoreCase)) existing = null; // installed elsewhere
        Label where = new Label { Text = "Install OpenSig in this folder:", Bounds = new Rectangle(0, 0, 520, 20) };
        dirBox.Bounds = new Rectangle(0, 22, 420, 24); dirBox.Text = o.Dir;
        Button browse = new Button { Text = "Browse…", Bounds = new Rectangle(428, 21, 92, 26) };
        browse.Click += delegate
        {
            using (FolderBrowserDialog d = new FolderBrowserDialog { Description = "Folder for OpenSig", SelectedPath = Directory.Exists(dirBox.Text) ? dirBox.Text : "" })
                if (d.ShowDialog(this) == DialogResult.OK) dirBox.Text = d.SelectedPath.EndsWith(Setup.AppName, StringComparison.OrdinalIgnoreCase) ? d.SelectedPath : Path.Combine(d.SelectedPath, Setup.AppName);
        };
        Label who = new Label { ForeColor = Color.DimGray, Bounds = new Rectangle(0, 52, 520, 34),
            Text = (existing != null ? "OpenSig " + (ver ?? "") + " is installed here and will be updated. " : "") +
                   (o.AllUsers ? "Installs for all users of this computer." : "Installs for you only – no administrator rights needed.") + "  Needs about 8 MB." };
        desktop.Text = "Create a desktop shortcut"; desktop.Checked = o.Desktop; desktop.Bounds = new Rectangle(0, 92, 520, 22);
        startMenu.Text = "Add OpenSig to the Start menu"; startMenu.Checked = o.StartMenu; startMenu.Bounds = new Rectangle(0, 116, 520, 22);
        assoc.Text = "Open OpenSig workspaces (.osw) and geometries (.osgeo) with OpenSig"; assoc.Checked = o.Assoc && o.Register; assoc.Enabled = o.Register; assoc.Bounds = new Rectangle(0, 140, 520, 22);
        options.Controls.AddRange(new Control[] { where, dirBox, browse, who, desktop, startMenu, assoc });
        if (!Setup.HasWebView2())
        {
            LinkLabel wv = new LinkLabel { Bounds = new Rectangle(0, 172, 520, 52), ForeColor = Color.FromArgb(160, 80, 0),
                Text = "OpenSig shows its windows with the Microsoft Edge WebView2 Runtime, which this computer does not seem to have (Windows 11 includes it). Get it from Microsoft." };
            wv.LinkArea = new LinkArea(wv.Text.IndexOf("Get it"), "Get it from Microsoft".Length);
            wv.LinkClicked += delegate { Process.Start(new ProcessStartInfo(Setup.WebView2Page) { UseShellExecute = true }); };
            options.Controls.Add(wv);
        }

        // page 2: progress
        working.Bounds = options.Bounds; working.Visible = false;
        status.Bounds = new Rectangle(0, 40, 520, 22); status.Text = "Installing…";
        bar.Bounds = new Rectangle(0, 66, 520, 20);
        working.Controls.AddRange(new Control[] { status, bar });

        // page 3: finished
        done.Bounds = options.Bounds; done.Visible = false;
        doneText.Bounds = new Rectangle(0, 20, 520, 90);
        launch.Text = "Start OpenSig now"; launch.Checked = true; launch.Bounds = new Rectangle(0, 120, 520, 22);
        done.Controls.AddRange(new Control[] { doneText, launch });

        Label line2 = new Label { Bounds = new Rectangle(0, 328, 560, 1), BackColor = Color.Gainsboro };
        next.Text = existing != null ? "Update" : "Install"; next.Bounds = new Rectangle(352, 340, 92, 28);
        cancel.Text = "Cancel"; cancel.Bounds = new Rectangle(452, 340, 92, 28);
        next.Click += delegate { if (finished) Finish(); else StartInstall(); };
        cancel.Click += delegate { Close(); };
        AcceptButton = next; CancelButton = cancel;
        Controls.AddRange(new Control[] { options, working, done, line2, next, cancel });

        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        ResumeLayout(false);
        PerformLayout();
    }

    void StartInstall()
    {
        string dir = dirBox.Text.Trim();
        if (dir.Length == 0 || !Path.IsPathRooted(dir)) { MessageBox.Show(this, "Enter a full folder path, for example " + Setup.DefaultDir(o.AllUsers), Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        while (Setup.RunningFrom(dir))
            if (MessageBox.Show(this, "OpenSig is running. Close it, then click Retry.", Text, MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning) != DialogResult.Retry) return;
        o.Dir = dir; o.Desktop = desktop.Checked; o.StartMenu = startMenu.Checked; o.Assoc = assoc.Checked;
        options.Visible = false; working.Visible = true; next.Enabled = false; cancel.Enabled = false;
        Thread t = new Thread(delegate ()
        {
            string error = null;
            try { Setup.Install(o, delegate (int pct, string msg) { BeginInvoke((Action)delegate { bar.Value = pct; status.Text = msg + "…"; }); }); }
            catch (Exception ex) { error = ex.Message; }
            BeginInvoke((Action)delegate { Done(error); });
        });
        t.IsBackground = true; t.Start();
    }

    void Done(string error)
    {
        working.Visible = false;
        if (error != null)
        {
            MessageBox.Show(this, "OpenSig could not be installed:\n\n" + error, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            options.Visible = true; next.Enabled = true; cancel.Enabled = true; return;
        }
        done.Visible = true; finished = true;
        doneText.Text = "OpenSig has been installed in\n" + o.Dir + "\n\n" +
            (o.StartMenu ? "Find it in the Start menu" + (o.Desktop ? " and on the desktop" : "") + ". " : o.Desktop ? "Find it on the desktop. " : "") +
            "To remove it, use Settings ▸ Apps ▸ Installed apps.";
        next.Text = "Finish"; next.Enabled = true; cancel.Visible = false;
    }

    void Finish()
    {
        if (launch.Checked) { try { Setup.Launch(o.Dir); } catch (Exception ex) { MessageBox.Show(this, ex.Message, Text); } }
        Close();
    }
}
