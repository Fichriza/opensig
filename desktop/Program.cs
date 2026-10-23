// OpenSig desktop host: a single-file Windows exe that embeds the OpenSig web app and renders it with the
// Edge WebView2 runtime, plus a native bridge (files, folders, serial, UDP/TCP, HTTP, EMF) and command-line
// automation over a named pipe. Written for the C# 5 compiler that ships with .NET Framework 4.x (no SDK needed).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Pipes;
using System.IO.Ports;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program
{
    public const string PipeName = "OpenSig.Automation";
    public static string[] StartArgs = new string[0];

    [STAThread]
    static int Main(string[] args)
    {
        AppDomain.CurrentDomain.AssemblyResolve += delegate(object s, ResolveEventArgs e)
        {
            string name = new AssemblyName(e.Name).Name;
            using (Stream st = Assembly.GetExecutingAssembly().GetManifestResourceStream("lib." + name + ".dll"))
            {
                if (st == null) return null;
                byte[] b = new byte[st.Length];
                st.Read(b, 0, b.Length);
                return Assembly.Load(b);
            }
        };
        if (args.Length > 0)
        {
            int code;
            if (Automation.TryRunAsClient(args, out code)) return code;
            StartArgs = args;
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Run();
        return 0;
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Run() { Application.Run(new MainForm()); }
}

// ---------------- Command-line automation (client side) ----------------
static class Automation
{
    [DllImport("kernel32.dll")] static extern bool AttachConsole(int pid);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int n);

    static TextWriter Out()
    {
        IntPtr h = GetStdHandle(-11);
        if (h == IntPtr.Zero || h == new IntPtr(-1)) AttachConsole(-1);
        StreamWriter w = new StreamWriter(Console.OpenStandardOutput()); w.AutoFlush = true; return w;
    }

    public const string Help =
        "OpenSig command-line automation (one command per call):\r\n" +
        "  OpenSig.exe <file>                       open a signal or workspace\r\n" +
        "  -loadsws <workspace.osw> [input file]    load a workspace, optionally replacing its input signal\r\n" +
        "  -saveswsd <workspace.osw>                save the workspace with data\r\n" +
        "  -closeall | -closeapp | -list | -show | -hide | -reset | -resetall\r\n" +
        "  -daqstart | -daqstop | -daqreset <window>\r\n" +
        "  -recstart | -recstop                     data logging to file\r\n" +
        "  -playnotone | -playwithtone | -playfast | -playinloop | -playstop <window>\r\n" +
        "  -zoomin | -zoomout <window>\r\n" +
        "  -getvalue <instrument window>            prints the instrument value\r\n" +
        "  -saveascii | -savewav16 | -savewav32 | -savebitmap <window> <file>\r\n" +
        "  -savesignalmetrics <window> <file.json>\r\n" +
        "  -extractvaluestocsv <file.csv>           append all instrument values as one CSV row\r\n" +
        "  -waitms <milliseconds>\r\n" +
        "Windows are identified by title, \"W<n>\" or \"<n>#title\".";

    public static bool TryRunAsClient(string[] args, out int code)
    {
        code = 0;
        string first = args[0].ToLowerInvariant();
        if (first == "-help" || first == "/?" || first == "--help") { Out().WriteLine(Help); return true; }
        if (first == "-waitms") { int ms; if (args.Length > 1 && int.TryParse(args[1], out ms)) Thread.Sleep(ms); return true; }
        NamedPipeClientStream pipe = Connect(400);
        if (pipe == null)
        {
            if (first == "-closeapp") return true;
            if (!first.StartsWith("-")) return false;          // plain file argument: become the GUI instance
            Process.Start(Application.ExecutablePath);           // start the GUI, then talk to it
            Stopwatch sw = Stopwatch.StartNew();
            while (pipe == null && sw.ElapsedMilliseconds < 45000) { Thread.Sleep(300); pipe = Connect(400); }
            if (pipe == null) { Out().WriteLine("OpenSig did not start."); code = 2; return true; }
        }
        using (pipe)
        {
            JavaScriptSerializer js = new JavaScriptSerializer();
            StreamWriter w = new StreamWriter(pipe, new UTF8Encoding(false)); w.AutoFlush = true;
            StreamReader r = new StreamReader(pipe, Encoding.UTF8);
            w.WriteLine(js.Serialize(new Dictionary<string, object> { { "args", args } }));
            string line = r.ReadLine();
            if (line == null) { code = 3; return true; }
            Dictionary<string, object> res = js.Deserialize<Dictionary<string, object>>(line);
            object output; if (res.TryGetValue("output", out output) && output != null && output.ToString().Length > 0) Out().WriteLine(output.ToString());
            object ok; code = res.TryGetValue("ok", out ok) && (bool)ok ? 0 : 1;
        }
        return true;
    }

    static NamedPipeClientStream Connect(int timeout)
    {
        NamedPipeClientStream p = new NamedPipeClientStream(".", Program.PipeName, PipeDirection.InOut);
        try { p.Connect(timeout); return p; } catch (Exception) { p.Dispose(); return null; }
    }
}

// ---------------- Main window and bridge ----------------
class MainForm : Form
{
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    // dark Windows title bar (attribute 20 on Windows 10 2004+ and 11, 19 on earlier Windows 10 builds)
    void SetDarkTitleBar(bool dark)
    {
        int v = dark ? 1 : 0;
        if (DwmSetWindowAttribute(Handle, 20, ref v, 4) != 0) DwmSetWindowAttribute(Handle, 19, ref v, 4);
    }
    const string Host = "opensig.app";
    readonly WebView2 web;
    readonly string dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenSig");
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Dictionary<string, TaskCompletionSource<Dictionary<string, object>>> automationWaits = new Dictionary<string, TaskCompletionSource<Dictionary<string, object>>>();
    readonly HashSet<string> approvedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<int, UdpClient> udp = new Dictionary<int, UdpClient>();
    readonly Dictionary<int, TcpListener> tcpServers = new Dictionary<int, TcpListener>();
    readonly Dictionary<string, TcpClient> tcpClients = new Dictionary<string, TcpClient>();
    readonly Dictionary<string, SerialPort> serial = new Dictionary<string, SerialPort>();
    bool pageReady;
    readonly object logLock = new object();
    void Log(string msg)
    {
        try { lock (logLock) File.AppendAllText(Path.Combine(dataRoot, "host.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "  " + msg + Environment.NewLine); } catch (Exception) { }
    }

    public MainForm()
    {
        json.MaxJsonLength = int.MaxValue;
        Text = "OpenSig";
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
        Rectangle wa = Screen.PrimaryScreen.WorkingArea;
        Size = new Size(Math.Min(1500, wa.Width - 40), Math.Min(950, wa.Height - 40));
        StartPosition = FormStartPosition.CenterScreen;
        if (wa.Width < 1300) WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(640, 420);
        web = new WebView2();
        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Color.FromArgb(171, 171, 171);
        Controls.Add(web);
        Load += async delegate { await InitAsync(); };
        FormClosing += delegate { CloseAllIo(); };
    }

    string ExtractApp()
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        string root = Path.Combine(dataRoot, "app", asm.ManifestModule.ModuleVersionId.ToString("N"));
        string marker = Path.Combine(root, ".complete");
        if (!File.Exists(marker))
        {
            foreach (string res in asm.GetManifestResourceNames())
            {
                string rel;
                if (res.StartsWith("web/")) rel = Path.Combine("web", res.Substring(4).Replace('/', Path.DirectorySeparatorChar));
                else if (res.StartsWith("native.")) rel = res.Substring(7);
                else continue;
                string path = Path.Combine(root, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                using (Stream src = asm.GetManifestResourceStream(res))
                using (FileStream dst = File.Create(path)) src.CopyTo(dst);
            }
            File.WriteAllText(marker, DateTime.Now.ToString("o"));
        }
        // Remove folders of older builds, but never while another OpenSig process may still be using one.
        bool othersRunning = Process.GetProcesses().Count(p => { try { return p.ProcessName.StartsWith("OpenSig", StringComparison.OrdinalIgnoreCase); } catch (Exception) { return false; } }) > 1;
        if (!othersRunning) try
        {
            foreach (string d in Directory.GetDirectories(Path.Combine(dataRoot, "app")))
                if (!string.Equals(d, root, StringComparison.OrdinalIgnoreCase)) { try { Directory.Delete(d, true); } catch (Exception) { } }
        }
        catch (Exception) { }
        return root;
    }

    async Task InitAsync()
    {
        try
        {
            string root = ExtractApp();
            CoreWebView2Environment.SetLoaderDllFolderPath(root);
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataRoot, "WebView2"));
            await web.EnsureCoreWebView2Async(env);
            CoreWebView2 c = web.CoreWebView2;
            c.Settings.AreBrowserAcceleratorKeysEnabled = false;
            c.Settings.AreDefaultContextMenusEnabled = false;
            c.Settings.IsStatusBarEnabled = false;
            c.Settings.IsZoomControlEnabled = false;
            c.Settings.AreDevToolsEnabled = Environment.GetEnvironmentVariable("OPENSIG_DEVTOOLS") == "1";
            // Serve the app from this instance's own folder. A per-window request handler (instead of a virtual host
            // mapping, which is shared by every window of the same WebView2 profile) lets different OpenSig builds run
            // side by side; requests to the app host are always answered locally and never reach the network.
            string webRoot = Path.GetFullPath(Path.Combine(root, "web")) + Path.DirectorySeparatorChar;
            c.AddWebResourceRequestedFilter("https://" + Host + "/*", CoreWebView2WebResourceContext.All);
            c.WebResourceRequested += delegate(object s, CoreWebView2WebResourceRequestedEventArgs e)
            {
                string rel = Uri.UnescapeDataString(new Uri(e.Request.Uri).AbsolutePath).TrimStart('/');
                if (rel.Length == 0) rel = "index.html";
                string full = Path.GetFullPath(Path.Combine(webRoot, rel.Replace('/', Path.DirectorySeparatorChar)));
                if (!full.StartsWith(webRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", "Content-Type: text/plain");
                    return;
                }
                string ext = Path.GetExtension(full).ToLowerInvariant();
                string mime = ext == ".html" ? "text/html; charset=utf-8" : ext == ".js" ? "text/javascript; charset=utf-8" : ext == ".css" ? "text/css; charset=utf-8"
                    : ext == ".json" ? "application/json" : ext == ".wasm" ? "application/wasm" : ext == ".png" ? "image/png" : ext == ".svg" ? "image/svg+xml" : "text/plain; charset=utf-8";
                e.Response = env.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(full)), 200, "OK", "Content-Type: " + mime + "\r\nCache-Control: no-cache");
            };
            c.WebMessageReceived += OnMessage;
            c.DownloadStarting += OnDownload;
            c.PermissionRequested += OnPermission;
            c.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; };
            c.NavigationStarting += delegate(object s, CoreWebView2NavigationStartingEventArgs e)
            {
                if (!e.Uri.StartsWith("https://" + Host + "/")) e.Cancel = true;
            };
            c.NavigationCompleted += delegate { if (!pageReady) { pageReady = true; StartPipeServer(); } };
            c.Navigate("https://" + Host + "/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this, "OpenSig needs the Microsoft Edge WebView2 Runtime, which is part of Windows 10/11.\n\nInstall it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and start OpenSig again.",
                "OpenSig", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "OpenSig could not start:\n\n" + ex.Message, "OpenSig", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    // ---------- messaging ----------
    void Post(Dictionary<string, object> m)
    {
        string s = json.Serialize(m);
        if (InvokeRequired) BeginInvoke(new Action(delegate { if (web.CoreWebView2 != null) web.CoreWebView2.PostWebMessageAsJson(s); }));
        else if (web.CoreWebView2 != null) web.CoreWebView2.PostWebMessageAsJson(s);
    }
    void Reply(object id, bool ok, object result, string error)
    {
        Dictionary<string, object> m = new Dictionary<string, object> { { "id", id }, { "ok", ok } };
        if (ok) m["result"] = result; else m["error"] = error;
        Post(m);
    }
    void Event(string name, Dictionary<string, object> data)
    {
        data["event"] = name; Post(data);
    }
    static string S(Dictionary<string, object> m, string k) { object v; return m.TryGetValue(k, out v) && v != null ? v.ToString() : ""; }
    static int I(Dictionary<string, object> m, string k, int d) { object v; int r; return m.TryGetValue(k, out v) && v != null && int.TryParse(v.ToString(), out r) ? r : d; }
    static bool B(Dictionary<string, object> m, string k) { object v; return m.TryGetValue(k, out v) && v is bool && (bool)v; }
    static long L(Dictionary<string, object> m, string k) { object v; long r; return m.TryGetValue(k, out v) && v != null && long.TryParse(v.ToString(), out r) ? r : 0; }

    void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        Dictionary<string, object> m;
        try { m = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson); } catch (Exception) { return; }
        object id; m.TryGetValue("id", out id);
        string type = S(m, "type");
        if (type == "exit") { Close(); return; }
        try { HandleRequest(type, m, id); }
        catch (Exception ex) { Log("request " + type + ": " + ex.Message); Reply(id, false, null, ex.Message); }
    }

    void HandleRequest(string type, Dictionary<string, object> m, object id)
    {
        switch (type)
        {
            case "openFiles":
                {
                    using (OpenFileDialog d = new OpenFileDialog())
                    {
                        d.Filter = S(m, "filter").Length > 0 ? S(m, "filter") : "All files (*.*)|*.*";
                        d.Multiselect = B(m, "multi");
                        List<object> files = new List<object>();
                        if (d.ShowDialog(this) == DialogResult.OK)
                            foreach (string p in d.FileNames) files.Add(FileEntry(p));
                        Reply(id, true, files, null);
                    }
                    break;
                }
            case "readFile": Reply(id, true, FileEntry(S(m, "path")), null); break;
            case "pickFile": // a path only: the file is read in parts (readRange)
                {
                    using (OpenFileDialog d = new OpenFileDialog())
                    {
                        d.Filter = S(m, "filter").Length > 0 ? S(m, "filter") : "All files (*.*)|*.*";
                        Reply(id, true, d.ShowDialog(this) == DialogResult.OK ? d.FileName : null, null);
                    }
                    break;
                }
            case "readRange": // size, time and up to 32 MB from offset of a file that another program may be writing
                {
                    string p = S(m, "path"); long off = Math.Max(0, L(m, "offset")); int len = Math.Max(0, Math.Min(I(m, "length", 0), 32 << 20));
                    using (FileStream f = new FileStream(p, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    {
                        long size = f.Length; byte[] b = new byte[off < size ? (int)Math.Min(len, size - off) : 0];
                        int n = 0, r;
                        if (b.Length > 0) { f.Seek(off, SeekOrigin.Begin); while (n < b.Length && (r = f.Read(b, n, b.Length - n)) > 0) n += r; }
                        if (n < b.Length) Array.Resize(ref b, n);
                        long mtime = (long)(File.GetLastWriteTimeUtc(p) - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
                        Reply(id, true, new Dictionary<string, object> { { "size", size }, { "mtime", mtime }, { "b64", Convert.ToBase64String(b) } }, null);
                    }
                    break;
                }
            case "exists": Reply(id, true, File.Exists(S(m, "path")) || Directory.Exists(S(m, "path")), null); break;
            case "writeFile":
                {
                    string p = S(m, "path"); Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(p)));
                    byte[] b = Convert.FromBase64String(S(m, "b64"));
                    using (FileStream f = new FileStream(p, B(m, "append") ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.Read)) f.Write(b, 0, b.Length);
                    Reply(id, true, new Dictionary<string, object> { { "path", p }, { "size", new FileInfo(p).Length } }, null);
                    break;
                }
            case "writeText":
                {
                    string p = S(m, "path"); Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(p)));
                    if (B(m, "append")) File.AppendAllText(p, S(m, "text")); else File.WriteAllText(p, S(m, "text"));
                    Reply(id, true, new Dictionary<string, object> { { "path", p } }, null);
                    break;
                }
            case "saveDialog":
                {
                    using (SaveFileDialog d = new SaveFileDialog())
                    {
                        d.FileName = S(m, "name"); d.Filter = S(m, "filter").Length > 0 ? S(m, "filter") : "All files (*.*)|*.*"; d.OverwritePrompt = true;
                        Reply(id, true, d.ShowDialog(this) == DialogResult.OK ? d.FileName : null, null);
                    }
                    break;
                }
            case "pickFolder":
                {
                    using (FolderBrowserDialog d = new FolderBrowserDialog())
                    {
                        d.Description = S(m, "title"); d.ShowNewFolderButton = true;
                        Reply(id, true, d.ShowDialog(this) == DialogResult.OK ? d.SelectedPath : null, null);
                    }
                    break;
                }
            case "listFiles":
                {
                    string[] files = Directory.GetFiles(S(m, "folder"), S(m, "pattern").Length > 0 ? S(m, "pattern") : "*.*");
                    Array.Sort(files, StringComparer.OrdinalIgnoreCase);
                    Reply(id, true, files, null);
                    break;
                }
            case "pickExecutable":
                {
                    using (OpenFileDialog d = new OpenFileDialog())
                    {
                        d.Filter = "Programs (*.exe;*.bat;*.cmd)|*.exe;*.bat;*.cmd|All files (*.*)|*.*";
                        string chosen = d.ShowDialog(this) == DialogResult.OK ? d.FileName : null;
                        if (chosen != null) approvedApps.Add(chosen);
                        Reply(id, true, chosen, null);
                    }
                    break;
                }
            case "runApp":
                {
                    string p = S(m, "path");
                    if (!File.Exists(p)) throw new Exception("Program not found: " + p);
                    if (!approvedApps.Contains(p))
                    {
                        if (MessageBox.Show(this, "An OpenSig instrument alarm wants to start:\n\n" + p + " " + S(m, "args") + "\n\nAllow this program to be started for the rest of this session?",
                            "OpenSig", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) throw new Exception("Not allowed by the user");
                        approvedApps.Add(p);
                    }
                    Process.Start(new ProcessStartInfo(p, S(m, "args")) { UseShellExecute = true });
                    Reply(id, true, true, null);
                    break;
                }
            case "beep": System.Media.SystemSounds.Exclamation.Play(); Reply(id, true, true, null); break;
            case "toolsFolder": // custom tools (.ost) listed under Signal tools > Use custom tool
                {
                    string p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "OpenSig", "Tools");
                    Directory.CreateDirectory(p);
                    Reply(id, true, p, null);
                    break;
                }
            case "openToolsFolder":
                {
                    string p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "OpenSig", "Tools");
                    Directory.CreateDirectory(p);
                    Process.Start(new ProcessStartInfo("explorer.exe", "\"" + p + "\"") { UseShellExecute = true });
                    Reply(id, true, true, null);
                    break;
                }
            case "saveEmf":
                {
                    string p = S(m, "path");
                    if (p.Length == 0)
                        using (SaveFileDialog d = new SaveFileDialog()) { d.FileName = S(m, "name"); d.Filter = "Enhanced Metafile (*.emf)|*.emf"; if (d.ShowDialog(this) != DialogResult.OK) { Reply(id, true, null, null); break; } p = d.FileName; }
                    using (MemoryStream ms = new MemoryStream(Convert.FromBase64String(S(m, "png"))))
                    using (Image img = Image.FromStream(ms))
                    using (Graphics refG = CreateGraphics())
                    {
                        IntPtr hdc = refG.GetHdc();
                        using (Metafile mf = new Metafile(p, hdc, new Rectangle(0, 0, img.Width, img.Height), MetafileFrameUnit.Pixel, EmfType.EmfPlusDual))
                        {
                            refG.ReleaseHdc(hdc);
                            using (Graphics g = Graphics.FromImage(mf)) g.DrawImage(img, 0, 0, img.Width, img.Height);
                        }
                    }
                    Reply(id, true, p, null);
                    break;
                }
            case "http": HttpProxy(m, id); break;
            case "udpListen":
                {
                    int port = I(m, "port", 0);
                    if (!udp.ContainsKey(port))
                    {
                        UdpClient u = new UdpClient(port); udp[port] = u;
                        new Thread(delegate()
                        {
                            IPEndPoint ep = new IPEndPoint(IPAddress.Any, 0);
                            try { while (true) { byte[] b = u.Receive(ref ep); Event("net", new Dictionary<string, object> { { "port", port }, { "b64", Convert.ToBase64String(b) } }); } }
                            catch (Exception) { }
                        }) { IsBackground = true }.Start();
                    }
                    Reply(id, true, true, null);
                    break;
                }
            case "tcpListen":
                {
                    int port = I(m, "port", 0);
                    if (!tcpServers.ContainsKey(port))
                    {
                        TcpListener l = new TcpListener(IPAddress.Any, port); l.Start(); tcpServers[port] = l;
                        new Thread(delegate()
                        {
                            try
                            {
                                while (true)
                                {
                                    TcpClient cl = l.AcceptTcpClient();
                                    new Thread(delegate()
                                    {
                                        try { NetworkStream ns = cl.GetStream(); byte[] buf = new byte[65536]; int n; while ((n = ns.Read(buf, 0, buf.Length)) > 0) { byte[] b = new byte[n]; Array.Copy(buf, b, n); Event("net", new Dictionary<string, object> { { "port", port }, { "b64", Convert.ToBase64String(b) } }); } }
                                        catch (Exception) { }
                                    }) { IsBackground = true }.Start();
                                }
                            }
                            catch (Exception) { }
                        }) { IsBackground = true }.Start();
                    }
                    Reply(id, true, true, null);
                    break;
                }
            case "netStop":
                {
                    int port = I(m, "port", 0);
                    UdpClient u; if (udp.TryGetValue(port, out u)) { u.Close(); udp.Remove(port); }
                    TcpListener l; if (tcpServers.TryGetValue(port, out l)) { l.Stop(); tcpServers.Remove(port); }
                    Reply(id, true, true, null);
                    break;
                }
            case "netSend":
                {
                    string proto = S(m, "proto"), host = S(m, "host"); int port = I(m, "port", 0);
                    byte[] b = Convert.FromBase64String(S(m, "b64"));
                    if (proto == "tcp")
                    {
                        string key = host + ":" + port; TcpClient cl;
                        if (!tcpClients.TryGetValue(key, out cl) || !cl.Connected) { cl = new TcpClient(); cl.Connect(host, port); tcpClients[key] = cl; }
                        cl.GetStream().Write(b, 0, b.Length);
                    }
                    else using (UdpClient u = new UdpClient()) u.Send(b, b.Length, host, port);
                    Reply(id, true, b.Length, null);
                    break;
                }
            case "serialList": Reply(id, true, SerialPort.GetPortNames(), null); break;
            case "serialOpen":
                {
                    string name = S(m, "port");
                    if (serial.ContainsKey(name)) { serial[name].Close(); serial.Remove(name); }
                    SerialPort sp = new SerialPort(name, I(m, "baud", 9600), (Parity)Enum.Parse(typeof(Parity), S(m, "parity").Length > 0 ? S(m, "parity") : "None"), I(m, "dataBits", 8),
                        (StopBits)Enum.Parse(typeof(StopBits), S(m, "stopBits").Length > 0 ? S(m, "stopBits") : "One"));
                    sp.Encoding = Encoding.ASCII; sp.NewLine = "\n";
                    sp.DataReceived += delegate { try { string t = sp.ReadExisting(); if (t.Length > 0) Event("serial", new Dictionary<string, object> { { "port", name }, { "text", t } }); } catch (Exception) { } };
                    sp.Open(); serial[name] = sp;
                    Reply(id, true, true, null);
                    break;
                }
            case "serialWrite":
                {
                    SerialPort sp; if (!serial.TryGetValue(S(m, "port"), out sp)) throw new Exception("Serial port is not open");
                    sp.Write(S(m, "text")); Reply(id, true, true, null);
                    break;
                }
            case "serialClose":
                {
                    SerialPort sp; if (serial.TryGetValue(S(m, "port"), out sp)) { sp.Close(); serial.Remove(S(m, "port")); }
                    Reply(id, true, true, null);
                    break;
                }
            case "automationReply":
                {
                    TaskCompletionSource<Dictionary<string, object>> t;
                    lock (automationWaits) { if (automationWaits.TryGetValue(S(m, "token"), out t)) automationWaits.Remove(S(m, "token")); }
                    if (t != null) t.TrySetResult(m);
                    Reply(id, true, true, null);
                    break;
                }
            case "log": Log("page: " + S(m, "text")); Reply(id, true, true, null); break;
            case "startArgs": Reply(id, true, Program.StartArgs, null); break;
            case "darkTitleBar": SetDarkTitleBar(B(m, "dark")); Reply(id, true, true, null); break;
            case "setTitle": Text = S(m, "title").Length > 0 ? S(m, "title") : "OpenSig"; Reply(id, true, true, null); break;
            case "show": WindowState = FormWindowState.Normal; Show(); Activate(); Reply(id, true, true, null); break;
            case "hide": WindowState = FormWindowState.Minimized; Reply(id, true, true, null); break;
            default: throw new Exception("Unknown host request: " + type);
        }
    }

    Dictionary<string, object> FileEntry(string p)
    {
        return new Dictionary<string, object> { { "path", p }, { "name", Path.GetFileName(p) }, { "b64", Convert.ToBase64String(File.ReadAllBytes(p)) } };
    }

    // HTTPS proxy for AI providers (avoids browser CORS limits). Runs off the UI thread.
    void HttpProxy(Dictionary<string, object> m, object id)
    {
        string url = S(m, "url"), method = S(m, "method").Length > 0 ? S(m, "method") : "POST", body = S(m, "body");
        Uri u = new Uri(url);
        if (u.Scheme != "https" && !u.IsLoopback) throw new Exception("Only https URLs (or localhost) are allowed");
        object hdrObj; m.TryGetValue("headers", out hdrObj);
        Dictionary<string, object> headers = hdrObj as Dictionary<string, object> ?? new Dictionary<string, object>();
        Task.Run(delegate
        {
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(u);
                req.Method = method; req.Timeout = 300000; req.ReadWriteTimeout = 300000;
                foreach (KeyValuePair<string, object> h in headers)
                {
                    if (string.Equals(h.Key, "content-type", StringComparison.OrdinalIgnoreCase)) req.ContentType = h.Value.ToString();
                    else req.Headers[h.Key] = h.Value.ToString();
                }
                if (method != "GET" && body.Length > 0)
                {
                    byte[] b = Encoding.UTF8.GetBytes(body); req.ContentLength = b.Length;
                    using (Stream s = req.GetRequestStream()) s.Write(b, 0, b.Length);
                }
                HttpWebResponse resp;
                try { resp = (HttpWebResponse)req.GetResponse(); } catch (WebException we) { resp = we.Response as HttpWebResponse; if (resp == null) throw; }
                using (resp)
                using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    Reply(id, true, new Dictionary<string, object> { { "status", (int)resp.StatusCode }, { "body", r.ReadToEnd() } }, null);
            }
            catch (Exception ex) { Reply(id, false, null, ex.Message); }
        });
    }

    // ---------- automation server ----------
    void StartPipeServer()
    {
        new Thread(delegate()
        {
            while (!IsDisposed)
            {
                try
                {
                    using (NamedPipeServerStream pipe = new NamedPipeServerStream(Program.PipeName, PipeDirection.InOut, 4, PipeTransmissionMode.Byte, PipeOptions.None))
                    {
                        pipe.WaitForConnection();
                        StreamReader r = new StreamReader(pipe, Encoding.UTF8);
                        StreamWriter w = new StreamWriter(pipe, new UTF8Encoding(false)); w.AutoFlush = true;
                        string line = r.ReadLine();
                        Dictionary<string, object> req = json.Deserialize<Dictionary<string, object>>(line ?? "{}");
                        Dictionary<string, object> res = RunAutomation(ToStrings(req.ContainsKey("args") ? req["args"] : null));
                        w.WriteLine(json.Serialize(res));
                        try { pipe.WaitForPipeDrain(); } catch (Exception) { }
                    }
                }
                catch (Exception ex) { Log("pipe: " + ex); Thread.Sleep(200); }
            }
        }) { IsBackground = true }.Start();
        if (Program.StartArgs.Length > 0) { string[] a = Program.StartArgs; Task.Run(delegate { RunAutomation(a); }); }
    }

    static string[] ToStrings(object a)
    {
        List<string> l = new List<string>();
        System.Collections.IEnumerable e = a as System.Collections.IEnumerable;
        if (e != null && !(a is string)) foreach (object o in e) l.Add(o == null ? "" : o.ToString());
        return l.ToArray();
    }

    Dictionary<string, object> RunAutomation(string[] args)
    {
        if (args.Length == 0) return new Dictionary<string, object> { { "ok", false }, { "output", "No command" } };
        string token = Guid.NewGuid().ToString("N");
        TaskCompletionSource<Dictionary<string, object>> t = new TaskCompletionSource<Dictionary<string, object>>();
        lock (automationWaits) automationWaits[token] = t;
        string first = args[0].ToLowerInvariant();
        Log("automation: " + string.Join(" ", args));
        if (first == "-ping") return new Dictionary<string, object> { { "ok", true }, { "output", "pong" } };
        if (first == "-closeapp") { BeginInvoke(new Action(Close)); return new Dictionary<string, object> { { "ok", true }, { "output", "" } }; }
        if (first == "-show" || first == "-hide") BeginInvoke(new Action(delegate { if (first == "-show") { WindowState = FormWindowState.Normal; Activate(); } else WindowState = FormWindowState.Minimized; }));
        Event("automation", new Dictionary<string, object> { { "token", token }, { "args", args } });
        if (t.Task.Wait(600000)) return t.Task.Result;
        return new Dictionary<string, object> { { "ok", false }, { "output", "Timed out" } };
    }

    void CloseAllIo()
    {
        foreach (UdpClient u in udp.Values) try { u.Close(); } catch (Exception) { }
        foreach (TcpListener l in tcpServers.Values) try { l.Stop(); } catch (Exception) { }
        foreach (TcpClient c in tcpClients.Values) try { c.Close(); } catch (Exception) { }
        foreach (SerialPort s in serial.Values) try { s.Close(); } catch (Exception) { }
    }

    void OnPermission(object sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead && e.Uri.StartsWith("https://" + Host + "/"))
            e.State = CoreWebView2PermissionState.Allow;
    }

    void OnDownload(object sender, CoreWebView2DownloadStartingEventArgs e)
    {
        CoreWebView2Deferral deferral = e.GetDeferral();
        BeginInvoke(new Action(delegate
        {
            try
            {
                string name = Path.GetFileName(e.ResultFilePath);
                string ext = Path.GetExtension(name).TrimStart('.').ToLowerInvariant();
                Dictionary<string, string> kinds = new Dictionary<string, string> {
                    { "wav", "WAV audio" }, { "csv", "CSV text" }, { "bin", "Raw binary" }, { "png", "PNG picture" }, { "json", "JSON" },
                    { "osw", "OpenSig workspace" }, { "ost", "OpenSig custom tool" }, { "js", "OpenSig script" }, { "bat", "Batch file" }, { "zip", "ZIP archive" }, { "md", "Markdown" } };
                using (SaveFileDialog dlg = new SaveFileDialog())
                {
                    dlg.FileName = name;
                    dlg.Filter = (kinds.ContainsKey(ext) ? kinds[ext] + " (*." + ext + ")|*." + ext + "|" : "") + "All files (*.*)|*.*";
                    dlg.OverwritePrompt = true;
                    if (dlg.ShowDialog(this) == DialogResult.OK) { e.ResultFilePath = dlg.FileName; e.Handled = true; }
                    else e.Cancel = true;
                }
            }
            finally { deferral.Complete(); }
        }));
    }
}
