# OpenSig for Mac

A native macOS app (`OpenSig.app`, Apple silicon and Intel, macOS 12 Monterey or newer) that shows OpenSig in a
WebKit window. It is built on the Mac itself in about a minute, with Apple's free command line tools.

## Build

1. Copy `OpenSig-mac-source.zip` to the Mac and double-click it. You get a folder `OpenSig-mac` with `mac` and
   `opensig` inside (keep them side by side).
2. Open **Terminal** and install Apple's command line tools once (skip this if you have Xcode):

   ```bash
   xcode-select --install
   ```

3. Build:

   ```bash
   bash ~/Downloads/OpenSig-mac/mac/build-mac.sh
   ```

   (Use the folder where you unzipped it.) The result is `mac/dist/OpenSig.app`. Drag it to **Applications**.

`mac/dist/OpenSig-mac.zip` is the same app zipped for other Macs. A Mac that did not build it treats it as an app from
an unidentified developer: the first time, right-click it ▸ **Open** ▸ **Open** (or System Settings ▸ Privacy &
Security ▸ **Open Anyway**).

## Using it

- Everything works as in the browser version: files open through the macOS Open panel, by drag and drop onto the
  window, or by **Open With ▸ OpenSig** in Finder (also by dropping them on the Dock icon). Saving shows the macOS
  Save panel.
- **Data acquisition** asks once for microphone access. If you said no: System Settings ▸ Privacy & Security ▸
  Microphone ▸ OpenSig.
- **Keys:** ⌘ works where the manual says Ctrl, ⌥ where it says Alt. The menus show the Mac keys. ⌘Q quits, so
  *Open data acquisition* is **⌃Q** (Control+Q). The F-keys (F1 help, F5–F7 play) need **fn** on a MacBook keyboard
  unless "Use F1, F2, etc. keys as standard function keys" is on. Closing the active window with Delete is
  **fn+delete** (a selected picked value is removed with plain delete too).
- **View** menu: ⌘+ / ⌘− / ⌘0 zoom the whole page; ⌃⌘F full screen.
- Settings, saved custom tools and the window position stay with the app.

## Differences from the Windows app

The Windows `OpenSig.exe` has a native host for extras that the Mac app does not have (yet): command-line automation,
recent-file lists, writing data/instrument logs and alarm actions straight into folders, UDP/TCP and serial ports, and
EMF pictures. On the Mac these behave as in the browser version (for example, logs are saved through the Save panel).

## For developers

- `main.swift` – the whole app: a loopback-only HTTP server serving `Contents/Resources/web` at
  `http://localhost:38731` (a secure context with a stable origin, so microphone input and stored settings work), the
  WKWebView window, menus, Open/Save panels, downloads and the microphone permission.
- `Info.plist` – bundle settings, the microphone usage text and the Finder "Open With" file types.
- `icon-1024.png` – the app icon (a blue circle with a white decaying wave); `build-mac.sh` turns it into
  `OpenSig.icns`. `make-icon.py` draws it again (`python mac/make-icon.py`, needs Pillow).
- Web Inspector: start the app with `OPENSIG_DEVTOOLS=1 ./mac/dist/OpenSig.app/Contents/MacOS/OpenSig`, then
  right-click the page ▸ Inspect Element (Safari's Develop menu also lists it on macOS 13.3 and later).
- After changing anything in `opensig/`, run `build-mac.sh` again.
