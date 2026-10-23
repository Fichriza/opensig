// OpenSig for macOS: a native window (WKWebView) around the OpenSig web app in Contents/Resources/web.
// A small HTTP server bound to the loopback interface serves those files at http://localhost:<port>/, which makes the
// page a secure context (microphone input, clipboard) with a stable origin (settings and saved tools persist).
// The app adds the macOS menus, Open/Save panels for the page's file inputs and downloads, the microphone permission,
// and opening files from Finder ("Open With", drop on the Dock icon). Build with build-mac.sh.
import Cocoa
import WebKit
import Network

let preferredPort: UInt16 = 38731

// MARK: - Local web server (loopback only, GET/HEAD of the bundled files)

final class LocalServer {
    private let root: URL
    private let queue = DispatchQueue(label: "org.opensig.server")
    private var listener: NWListener?
    private var opened: [String: URL] = [:]          // token → a file opened from Finder, served at /__open/<token>/
    private let lock = NSLock()
    private(set) var port: UInt16 = 0

    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }

    /// Listens on the preferred port (a stable origin keeps the page's stored settings), else the next free one.
    func start() -> Bool {
        for p in preferredPort..<(preferredPort + 40) where listen(on: p) { return true }
        return listen(on: 0)
    }

    private func listen(on p: UInt16) -> Bool {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback
        let made: NWListener?
        if p == 0 { made = try? NWListener(using: params) }
        else { made = try? NWListener(using: params, on: NWEndpoint.Port(rawValue: p)!) }
        guard let l = made else { return false }
        let sem = DispatchSemaphore(value: 0)
        var ready = false
        l.stateUpdateHandler = { state in
            switch state {
            case .ready: ready = true; sem.signal()
            case .failed, .cancelled: sem.signal()
            default: break
            }
        }
        l.newConnectionHandler = { [weak self] c in self?.serve(c) }
        l.start(queue: queue)
        if sem.wait(timeout: .now() + 3) == .timedOut || !ready { l.cancel(); return false }
        l.stateUpdateHandler = nil
        listener = l
        port = l.port?.rawValue ?? p
        return true
    }

    func register(_ file: URL) -> String {
        let token = UUID().uuidString
        lock.lock(); opened[token] = file; lock.unlock()
        return token
    }

    private func serve(_ c: NWConnection) {
        c.start(queue: queue)
        receive(c, Data())
    }

    private func receive(_ c: NWConnection, _ buffer: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
            guard let self = self else { c.cancel(); return }
            var b = buffer
            if let d = data { b.append(d) }
            if let end = b.range(of: Data("\r\n\r\n".utf8)) {
                self.respond(c, head: String(decoding: b[..<end.lowerBound], as: UTF8.self))
            } else if error != nil || done || b.count > 65536 {
                c.cancel()
            } else {
                self.receive(c, b)
            }
        }
    }

    private func respond(_ c: NWConnection, head: String) {
        let lines = head.components(separatedBy: "\r\n")
        let request = lines.first?.split(separator: " ").map(String.init) ?? []
        guard request.count >= 2 else { return send(c, 400, "Bad Request") }
        let method = request[0]
        guard method == "GET" || method == "HEAD" else { return send(c, 405, "Method Not Allowed") }
        // only requests for this server's own name (no DNS rebinding of other sites onto it)
        let host = lines.dropFirst().first { $0.lowercased().hasPrefix("host:") }?.dropFirst(5).trimmingCharacters(in: .whitespaces).lowercased() ?? ""
        guard host == "localhost:\(port)" || host == "127.0.0.1:\(port)" || host == "[::1]:\(port)" else { return send(c, 403, "Forbidden") }

        var path = String(request[1].split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first ?? "/")
        path = path.removingPercentEncoding ?? path
        if path == "/" { path = "/index.html" }

        var file: URL?
        if path.hasPrefix("/__open/") {
            let token = String(path.dropFirst(8).split(separator: "/").first ?? "")
            lock.lock(); file = opened[token]; lock.unlock()
        } else {
            let f = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL.resolvingSymlinksInPath()
            if f.path.hasPrefix(root.path + "/") { file = f }
        }
        guard let url = file, let body = try? Data(contentsOf: url, options: .mappedIfSafe) else { return send(c, 404, "Not Found") }
        send(c, 200, "OK", type: mime(url.pathExtension), body: body, headOnly: method == "HEAD")
    }

    private func send(_ c: NWConnection, _ status: Int, _ reason: String, type: String = "text/plain; charset=utf-8", body: Data? = nil, headOnly: Bool = false) {
        let payload = body ?? Data(reason.utf8)
        var out = Data(("HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(payload.count)\r\n" +
                        "Cache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n").utf8)
        if !headOnly { out.append(payload) }
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }

    private func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "ico": return "image/x-icon"
        case "wasm": return "application/wasm"
        case "txt", "md": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - Application

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: LocalServer!
    private var pageLoaded = false
    private var pendingFiles: [URL] = []
    private var lastSaveFolder: URL?
    private let devTools = ProcessInfo.processInfo.environment["OPENSIG_DEVTOOLS"] == "1"
    private var origin: String { "http://localhost:\(server.port)" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenus()
        guard let web = Bundle.main.resourceURL?.appendingPathComponent("web"),
              FileManager.default.fileExists(atPath: web.appendingPathComponent("index.html").path) else {
            return fail("The OpenSig web files are missing from the app bundle. Build it again with build-mac.sh.")
        }
        server = LocalServer(root: web)
        guard server.start() else { return fail("OpenSig could not start its local page server.") }

        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "OpenSigMac/" + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1")
        config.mediaTypesRequiringUserActionForPlayback = []
        if devTools { config.preferences.setValue(true, forKey: "developerExtrasEnabled") }
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 820), configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        if #available(macOS 13.3, *) { webView.isInspectable = devTools }
        let zoom = UserDefaults.standard.double(forKey: "pageZoom")
        if zoom > 0 { webView.pageZoom = zoom }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "OpenSig"
        window.minSize = NSSize(width: 760, height: 480)
        window.tabbingMode = .disallowed
        window.contentView = webView
        window.center()
        _ = window.setFrameAutosaveName("OpenSigMain")
        window.makeKeyAndOrderFront(nil)

        webView.load(URLRequest(url: URL(string: origin + "/index.html")!))
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Files opened from Finder or dropped on the Dock icon: served once under a random token, then opened by the page
    func application(_ application: NSApplication, open urls: [URL]) {
        pendingFiles += urls
        if pageLoaded { openPendingFiles() }
    }

    private func openPendingFiles() {
        let files = pendingFiles; pendingFiles = []
        for f in files {
            let token = server.register(f)
            let args = [origin + "/__open/" + token + "/" + (f.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "file"), f.lastPathComponent]
            guard let json = try? JSONSerialization.data(withJSONObject: args), let list = String(data: json, encoding: .utf8) else { continue }
            webView.evaluateJavaScript("""
                (() => { const [url, name] = \(list);
                  UI.guard(async () => { const r = await fetch(url); if (!r.ok) throw new Error('Could not read ' + name);
                    await UI.openFile(new File([await r.blob()], name)); })(); })();
                """, completionHandler: nil)
        }
    }

    private func fail(_ message: String) {
        let a = NSAlert()
        a.messageText = "OpenSig cannot start"
        a.informativeText = message
        a.runModal()
        NSApp.terminate(nil)
    }

    // MARK: Menus (the OpenSig menu bar itself is inside the window, as on Windows)

    private func buildMenus() {
        let main = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let m = NSMenu(title: title)
            item.submenu = m
            main.addItem(item)
            return m
        }
        let app = submenu("OpenSig")
        app.addItem(withTitle: "About OpenSig", action: #selector(about(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide OpenSig", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .option]
        app.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit OpenSig", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let edit = submenu("Edit")   // text fields of the dialogs: undo, cut, copy, paste, select all
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z").keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let view = submenu("View")
        view.addItem(withTitle: "Actual Size", action: #selector(zoomReset(_:)), keyEquivalent: "0")
        view.addItem(withTitle: "Zoom In", action: #selector(zoomIn(_:)), keyEquivalent: "=")
        view.addItem(withTitle: "Zoom Out", action: #selector(zoomOut(_:)), keyEquivalent: "-")
        view.addItem(.separator())
        view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]

        let win = submenu("Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        NSApp.windowsMenu = win

        let help = submenu("Help")
        help.addItem(withTitle: "OpenSig Help", action: #selector(showHelp(_:)), keyEquivalent: "?")
        NSApp.helpMenu = help
        NSApp.mainMenu = main
    }

    @objc private func about(_ sender: Any?) {
        let credits = NSAttributedString(string: "A signal analysis workbench: linked windows, FFT and spectrograms, filters, instruments, peak detection and live audio input. Everything runs on this Mac.",
                                         attributes: [.font: NSFont.systemFont(ofSize: 11)])
        NSApp.orderFrontStandardAboutPanel(options: [.credits: credits])
    }
    @objc private func showHelp(_ sender: Any?) { webView.evaluateJavaScript("window.HELP && HELP.open()", completionHandler: nil) }
    @objc private func zoomReset(_ sender: Any?) { setZoom(1) }
    @objc private func zoomIn(_ sender: Any?) { setZoom(min(3, webView.pageZoom * 1.1)) }
    @objc private func zoomOut(_ sender: Any?) { setZoom(max(0.5, webView.pageZoom / 1.1)) }
    private func setZoom(_ z: Double) { webView.pageZoom = z; UserDefaults.standard.set(z, forKey: "pageZoom") }

    // MARK: Page navigation: other sites open in the default browser, downloads go to a Save panel

    private func isOwn(_ url: URL) -> Bool { url.host == "localhost" && url.port == Int(server.port) }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { return decisionHandler(.download) }
        if let url = action.request.url, let scheme = url.scheme?.lowercased(),
           ["http", "https", "mailto"].contains(scheme), !isOwn(url), action.targetFrame?.isMainFrame ?? true {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        openPendingFiles()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        if let folder = lastSaveFolder { panel.directoryURL = folder }
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let url = panel.url else { return completionHandler(nil) }
            try? FileManager.default.removeItem(at: url)   // the panel has already asked whether to replace it
            self.lastSaveFolder = url.deletingLastPathComponent()
            completionHandler(url)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let a = NSAlert(error: error)
        a.beginSheetModal(for: window, completionHandler: nil)
    }

    // MARK: Page UI: file inputs, alert / confirm / prompt, microphone, new windows

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert()
        a.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    // live audio input (Data acquisition); macOS itself asks once for microphone access
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "localhost" && origin.port == Int(server.port) && type == .microphone ? .grant : .deny)
    }

    // target=_blank / window.open: the default browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) { NSWorkspace.shared.open(url) }
        return nil
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
