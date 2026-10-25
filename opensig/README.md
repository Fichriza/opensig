# OpenSig

A signal analysis workbench built around a *linked-window* workflow, as a Windows desktop app (`OpenSig.exe`) and
as a web page. It is an independent, clean-room program: no code, help text, example media, icons or licensing logic
of any other product is included, and it is not affiliated with any other software vendor.

## Run

- **Desktop:** `desktop/dist/OpenSig.exe` (single file, 64-bit Windows 10/11), or install it with
  `desktop/dist/OpenSig-Setup.exe` (Start menu, desktop shortcut, Settings ▸ Apps entry) – see *Installer* below.
- **Mac:** `OpenSig.app` (Apple silicon and Intel, macOS 12+), built on the Mac with `bash mac/build-mac.sh` – see
  `mac/README.md`. It shows this folder in a WebKit window served from `http://localhost`, with the macOS menus,
  Open/Save panels, microphone permission and Finder "Open With"; shortcuts use ⌘ (⌃Q opens acquisition).
- **Browser:** open `index.html`, or serve the folder so live audio input works:

```bash
python -m http.server 8731 --bind 127.0.0.1 --directory opensig
```

Tests (Node 18+):

```bash
node --test opensig/test/dsp.test.js opensig/test/formats.test.js opensig/test/fft_reference.test.js opensig/test/peaks_reference.test.js
```

## Desktop app

`OpenSig.exe` (about 7 MB) embeds this folder and renders it with the Microsoft Edge WebView2 runtime that ships with
Windows. On first start it unpacks itself to `%LOCALAPPDATA%\OpenSig`. The desktop app adds:

- the original keyboard shortcuts (F5 play, F12 settings, Ctrl+W load workspace, Ctrl+N clipboard, Ctrl+R start acquisition),
- native Open/Save dialogs, recent signals/workspaces, "Replace signal with…", and workspaces that store file references,
- writing to folders: data logging, instrument value logs, alarm actions, batch processing,
- UDP/TCP network receiver/sender and serial input/output,
- EMF picture export, launching a program on an instrument alarm (asks once per program and session),
- command-line automation (see below). `host.log` in `%LOCALAPPDATA%\OpenSig` records automation calls and errors.

Set `OPENSIG_DEVTOOLS=1` before starting to enable the developer tools. Rebuild after changing anything in `opensig/`:

```bash
powershell -ExecutionPolicy Bypass -File desktop/build.ps1
```

The script uses the .NET Framework 4.8 C# compiler that comes with Windows. It downloads the
Microsoft.Web.WebView2 NuGet package once into `%TEMP%\osbuild` and checks its Microsoft signature.

### Installer

`desktop/dist/OpenSig-Setup.exe` (about 1.7 MB: `OpenSig.exe` gzip-compressed inside) installs OpenSig:

- for the current user in `%LOCALAPPDATA%\Programs\OpenSig` without administrator rights, or – started with
  *Run as administrator* – for all users in `C:\Program Files\OpenSig`; another folder can be chosen;
- with a Start menu entry and a desktop shortcut, optionally opening `.osw` workspaces and `.osgeo` geometries with
  OpenSig, and an entry in Settings ▸ Apps ▸ Installed apps whose *Uninstall* runs `Uninstall OpenSig.exe` from the
  install folder (it removes the files, shortcuts, file types and the Apps entry; it asks whether to remove the
  settings in `%LOCALAPPDATA%\OpenSig` too);
- running it again updates an existing installation in place (close OpenSig first); it warns when the WebView2
  runtime is missing (Windows 11 includes it) and links to Microsoft's download page.

Command line: `/S` silent, `/D=<folder>`, `/NODESKTOP`, `/NOSTARTMENU`, `/NOASSOC`, `/LAUNCH`; uninstall with
`"Uninstall OpenSig.exe" /UNINSTALL [/S] [/PURGE]`. Exit codes: 0 done, 1 failed (silent: reason in
`%TEMP%\OpenSig-Setup.log`), 2 OpenSig is running. For testing, `/REGTEST=<key>` puts all registry entries under
`HKCU\<key>` and `/SHORTCUTDIR=<folder>` puts the shortcuts there. Build it (after `build.ps1`, or with `-Rebuild`):

```bash
powershell -ExecutionPolicy Bypass -File desktop/build-installer.ps1
```

The version shown in Settings ▸ Apps defaults to `1.<yy>.<MMdd>` of the build day (`-Version 1.2.3` to set it);
`-App desktop/dist/OpenSig-new.exe` packs a build made while OpenSig was running. The
installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC" on the first run: click
*More info* ▸ *Run anyway*, or sign `OpenSig-Setup.exe` with your own certificate before handing it out.

### Command-line automation

The switches follow the original's automation commands; one command per call, talking to the running instance
(started automatically if needed). Windows are named by title, `W<n>` or `<n>#title`.

```bash
OpenSig.exe -loadsws "C:\test\daq_rms.osw" "C:\data\input.wav"
```

`-closeall -closeapp -list -show -hide -reset -resetall -loadsws -saveswsd -daqstart -daqstop -daqreset -recstart
-recstop -playnotone -playwithtone -playfast -playinloop -playstop -zoomin -zoomout -getvalue -saveascii -savewav16
-savewav32 -savebitmap -savesignalmetrics -extractvaluestocsv -waitms -help`. File ▸ Batch file processing script
generator writes a `.bat` file built on these commands.

## Features

- **Linked windows:** every window is a node in a tree. Derived windows recompute when their parent changes. Spectral
  tools and instruments use the parent's visible part, so zooming or playing (F5) animates everything below it.
- **Window ▸ Organize**: one band across the desktop per analysis tree (a source window and everything made from it),
  graphs side by side (3–4 to a line) and instruments in a narrow column at the right. A window made from several
  signals (geometry, calculator) takes the right half of its band, unlinked instruments a strip along the bottom; too
  many trees for the height tile instead. **Organize automatically** (Window menu, Application settings) repeats it whenever a window opens or
  closes, or the desktop changes size.
- **Control Window** (System control ▸ Control window, Alt+W): the analysis graph – a node per window,
  curves from parent to child (dotted when unlinked, coloured for the inputs of multi-input and overlay windows), "H" on
  hidden windows. **Wiring:** each node has an output port, analysis windows an input port; dragging an output onto a
  node makes that window work on this one (`APP.link`, checked first: no loops, a signal or spectrum as input, a 3D
  window only for cross sections), into empty space (or clicking it) opens the Add analysis menu there and places the
  new node at the drop point; dragging an input onto a node re-links it, into empty space unlinks it; right-clicking a
  curve unlinks / relinks it or removes an overlay. **Add analysis** in a node's menu runs the Signal tools,
  Instruments, 3D tools and Scripts menus on that window (cursor, picker, view and settings entries left out); on all
  selected windows from the empty-space menu. **View:** wheel zooms at the pointer (25–300 %), Shift / Alt + wheel,
  middle-drag or Space-drag pan, Fit (F, double-click on empty space) keeps the whole graph in view at up to 100 %
  until the user zooms or pans, 0 = 100 %, +/−; **Pictures** draws each node as a card with a live picture of its
  window (plot canvas, video frame, instrument value), and with icons a hovered node shows its picture beside it.
  **Layout:** left-to-right or top-to-bottom tree, Compact spacing, folding a branch into its node (± box, "+N"
  hidden windows, fold / unfold all) – direction, spacing and pictures in localStorage, folds and hand-placed positions
  (per direction: `display.cwPos` / `cwPosTb`) in the workspace. `CONTROL.where(id)` gives a node and its ports in client
  coordinates (used by the tests). Click to select (numbers show the order), drag a rectangle to select several (Ctrl unselects),
  double-click to bring a window forward, Del deletes the selection. Rename a node (its window) by double-clicking its
  name, F2, or Rename… in its right-click menu: an in-place text box (Enter / Esc; empty = the automatic name for
  analysis windows); custom names are saved with workspaces and kept when settings change. Right-click an icon for its window menu, or empty
  space for the commands on all selected windows: select all / clear / invert, hide / show / delete, save as one
  multi-channel WAV or one CSV, show in one window or as overlay, average, concatenate, FFT / Time FFT / spectrogram /
  filter / custom tool on all selected (a settings dialog is shown once), zoom, sample-unit ruler, unlink / relink.
  Icons move freely: drag one (or all selected ones) anywhere – snapped to an 8 px grid unless "Snap icons to grid"
  is off – or nudge the selection with the arrow keys (Shift: 1 px). They keep their place, saved with the workspace;
  a window's Picked values node can be moved too and follows its window. "Arrange icons automatically" (all or the
  selected ones) brings back the tree layout. Dropping an icon onto another copies that analysis there (Ctrl: moves
  it); a source dropped with Shift is duplicated with its analysis.
- **Edit node** (Signal tools / Edit ▸ Edit node (table)…, window menu ▸ Add edit node): a window in the tree whose
  result is its parent's values with the changes typed into a simple spreadsheet – name box, formula bar, row numbers,
  X and Y columns, changed cells in yellow with the original in the tooltip, status bar with average / count / sum.
  Numbers or `=formulas` (x, y = original, i = row; + − * / ^, pi, sqrt, sin, abs, min, max, …), Ctrl+Enter fills the
  selection, Delete / Restore bring back originals, Ctrl+Z / Ctrl+Y, Ctrl+C / Ctrl+V (a column of numbers), name box
  jumps (Y100). Windows linked below it use the edited values; the parent is unchanged; the changes are saved with
  the workspace. "Graph" shows the result as a signal (window menu ▸ Show as table switches back).
- **Geometry and mode shapes** (3D tools ▸ Geometry and mode shapes…, Control Window ▸ Geometry with the selected
  signals): a node in the tree with a 3D model of the test object and the measured channels assigned to node directions.
  - Model: nodes, lines, surfaces; generators (grid, rectangle outline, box, circle, cylinder, truncated cone, beam) at an
    origin; CSV paste; UFF/UNV import and export (datasets 15/2411, 82, 2412); renumbering (first number, increment,
    order by number / X / Y / Z, with lines, surfaces and channels following); renaming one node (number and/or a
    name such as "Midspan north", via Rename…, double-click, right-click or F2; names show in the view and the DOF
    table and are kept in .osgeo files).
  - FDD plot: zoom by dragging over a range or with the wheel, Shift+drag to pan, double-click for the whole range;
    the level axis follows the range, a readout shows frequency and level under the pointer, and the peak list
    covers the range shown.
  - Drawing tools in the view: add points on a working plane that faces the view (through the selected node, with
    snap), move points, draw lines, draw surfaces (3 or 4 nodes). The view keeps its scale while drawing.
  - Channels (DOFs): ±X/Y/Z or ±R/T/A relative to a cylinder axis (radial, tangential, axial; set by the cylinder,
    cone and circle generators or the Cylinder axis dialog); reference channels (phase 0 of the ODS, ringed in the
    view); Auto assign (channels to nodes in turn, one or more directions per node, node order, start node, skipped
    nodes, reference windows, with a live preview).
  - Animation: the measured motion in slow motion, the operating deflection shape at a frequency (relative to a
    reference channel) or the mode shape from Frequency Domain Decomposition (singular values of the Welch
    cross-spectral matrix, prominence-picked peaks, first singular vector). Dwell, a still 0° / 180° display, or a
    frequency sweep; step back / forward while paused; recording to WebM/MP4 (MediaRecorder); a colour legend for
    the deflection; unmeasured nodes can follow their neighbours.
  - Files: Save… writes an OpenSig geometry (.osgeo: JSON with nodes, lines, surfaces, cylinder axis and, optionally,
    the sensor layout by channel name – reopening connects open signal windows with the same names) or a universal
    file (.unv); Open… reads .osgeo and .uff/.unv (replace or add). `.osgeo` files also open from File ▸ Open and by
    drag and drop. `GEOMATH.writeGeometryFile` / `parseGeometryFile` hold the format.
  - Modes tab: natural frequency and damping ratio of each FDD peak by Enhanced FDD (the bell of bins whose first
    singular vector has MAC ≥ 0.8 with the peak's → inverse FFT → correlation function, corrected for the Hann window
    → log decrement of its extremes between 0.9 and 0.2 and zero crossings), the MAC matrix of the mode shapes, the
    correlation function with the fitted decay, copy as text, and an Excel workbook (Modes, MAC, Mode shapes, Info)
    written by `FORMATS.xlsx`. On the simulated deck, 20-minute records give unbiased damping (1.48–1.54 % for
    1.5 %, 1.09–1.22 % for 1.2 %); `GEOMATH.efdd` / `macMatrix` hold the math and `test/dsp.test.js` checks it.
  - Roving tests: a Setup number per channel (same number = recorded together). Auto assign numbers the setups, puts
    a later setup's reference windows on the earlier references' nodes and directions, and skips points already
    measured. Each setup gets its own spectra; the FDD peaks are picked on the average of the setups' normalised first
    singular values; each setup's shape (FDD, ODS or EFDD) is scaled onto the others through the shared DOFs (complex
    least squares, `GEOMATH.mergeShapes`) and averaged; Modes show mean frequency and damping with the spread, the
    shared-DOF agreement (MAC), and an Excel *Setups* sheet. Time animation plays one setup. Example: Help ▸ Examples
    ▸ Bridge deck: roving test in 2 setups (6 sensors, references at 10 m); on it the combined shapes match the true
    ones with MAC ≥ 0.995 (`test/dsp.test.js`).
  - ▶ Run: checks the finished model (nodes, channels on nodes, open windows, one sample rate), finds its modes (FDD
    peaks) and animates the first in a full-size view with one button per mode; ✎ Edit model returns to the editor.
  - Layout: a new window nearly fills the work area; the editor is 420 px wide by default and resizable by dragging
    its border (kept with the window), with fixed DOF columns so channel, node and direction stay readable.
  - View: rotate / pan / zoom and seven standard views (Iso, Top, Bottom, Front, Back, Left, Right). Saved with
    workspaces (channel windows are remapped on load). A large Geometry button (56 px icon) sits at the right end of
    the toolbar, after Help, as tall as both rows (`UI.TOOLBAR_SIDE`).
  - Example (Help ▸ Examples ▸ Bridge deck): a 30 m × 8 m single-span deck with 10 vertical accelerometers (2
    references) and 5 min of simulated ambient vibration exciting 1st/2nd vertical bending and torsion (3.2, 4.7,
    12.1, 15.3 Hz); it opens on the FDD tab animating the first mode. The data come from `GEOMATH.bridgeDeck()`, and a
    test checks that FDD finds the four modes (MAC > 0.99).
  - `js/geomath.js` holds the math and UFF code; `test/dsp.test.js` checks FDD shapes (MAC), ODS, UFF parsing, the
    generators, renumbering, cylinder directions and auto-assignment.
  - Basis: standard modal-analysis practice, plus a feature inventory of ARTeMIS Modal made with REA without running
    the program – only the names of its views, commands and fields (WPF layout files and readable words in its
    compiled views). Its code, obfuscated strings and licensing were not examined, and none of its code, text or
    artwork is used.
- **Cable tension from vibration** (`js/cable.js`, `js/cablemath.js`; 3D tools ▸ Cable tension from vibration…, the
  large cable button right of Geometry): the tension of a stay cable, hanger or tie from an accelerometer on it. Input:
  the signal (its visible part) and the cable data – length, mass per metre, E, I, A, inclination, design tension –
  kept for the next cable. From a signal it opens a PSD window (Welch, Hann, half-overlapping segments, dB) with its
  peak detection switched on (Signal tools ▸ Peak detection…, prominence 8 dB, parabolic position) and the cable window
  under it; on a spectrum window it uses that spectrum and its peak detection. Every peak detection method works, and
  the cable window follows its settings (Peak detection… in its bar). The cable window numbers the detected peaks as
  the harmonic series: the first frequency whose first six harmonics fall on the detected peaks that stand out most
  (with the inharmonicity of bending stiffness), then mode by mode from a line of (f_n/n)² over n²; weak peaks and
  modes off a robust Theil–Sen line are left out, and a click on a mode (table or plot) overrides that. Five methods: taut string, beam with hinged ends,
  beam with clamped ends (the exact frequency equation, solved by bisection), a fit of several modes that also finds EI,
  and Zui, Shinke & Namita (1996) with the bending and sag parameters ξ and Γ; plus Irvine's λ², the sag ratio, the
  ratio to the design tension and notes when the methods disagree. Copy and Excel export (sheets Tension and Modes).
  Two examples (Help ▸ Examples): a stay cable (80 m, 2950 kN) and a short arch hanger (12 m, 450 kN, ξ ≈ 22) with
  simulated ambient records; `test/cable.test.js` checks the formulas against the clamped-beam roots and asymptotes,
  Zui's formulas against the exact beam, and the whole chain on both simulated records (within 0.5 % and 1 %).
- **Files:** WAV (with a display-settings chunk), FLAC/MP3/OGG/AIFF/M4A, ASCII/CSV, raw binary (5 formats),
  MATLAB `.mat` (v5 incl. compressed and structs; v7.3 via HDF5), NumPy `.npy`/`.npz`, UFF/UNV dataset 58, GDF 1/2,
  EDF/BDF, HDF5/JLD2/NetCDF-4 (signal selection dialog), data-log `.sig` + `.txt`, clipboard, `.flt` filter
  curves and `.flb` filter banks, `.cal` calibration files.
- **Video windows** (`js/video.js`; File ▸ Open video…, a dropped video file, Attach a video… in a signal window's
  menu): the video in a window of its own and its sound as signal windows, the video linked to the first channel – or
  to any time signal with an offset (Sync with signal…). It plays along (muted) while the signal plays with sound,
  shows the frame at the end of the visible part while it plays without sound, else the frame at the signal's cursor
  or the start of its visible part; its own controls draw a playhead over the signal and set the cursor where they
  stop. Frame steps, the video's own sound on or off. The desktop app streams the file from disk in byte ranges (host
  call `mediaUrl`, served under `/__media/`), so videos of any size seek; workspaces keep the offset and, in the
  desktop app, the path. In the desktop app the video follows the sound within about one frame (measured).
- **Following a CSV file that keeps growing** (`js/follow.js`; File ▸ ASCII / CSV files and Data acquisition ▸ Follow
  updating CSV file…): the import settings plus the check interval, whether the writing program appends rows or writes
  the whole file again, and how many seconds to keep. New complete rows are appended to the column windows, and linked
  windows follow; a file that gets shorter is read again from the start. The desktop app reads parts of the file
  through the `readRange` host call, sharing it with the program that writes it; Chrome / Edge use the File System
  Access API. Not available in Safari or the Mac app.
- **Spectral analysis:** reference-checked FFT (see below): magnitude/power/PSD/phase/real/imag with 15 windows, zero
  padding, segment and complex averaging, average of last X spectra, smoothing, dB/dBFS, Siegel's test, A/C weighting,
  custom filter curves; the FFT presets; octave, 1/3–1/12 octave and custom filter
  bank plots; cepstrum; spectrogram, time FFT (mesh), Morlet CWT; cross-spectrum, coherence, FRF.
- **Signal tools:** FFT filters (incl. custom curves), Butterworth IIR, resample, moving average, detrend, DC, peak
  removal, scale, peak/min hold, averager, histogram, integral, derivative, sorted values, Hilbert envelope, local-max
  envelope, instantaneous frequency, zero crossings, wavelet denoising (Haar/Daubechies 2/4/6), tacho → RPM, signal
  alignment, SRS, instrument values over time, generator, signal calculator (incl. `cfft`, `ifft`,
  `toorder`/`fromorder` order analysis, `xcorr`, `conv`, `coherence`, `frfmag`, `align`).
- **Instruments:** 45+ measures (statistics, RMS, dB(A/C/Z), THD/THD+N/SNR, spectral centroid/flatness, damping
  factor, fractal dimension, Shannon entropy, harmonics 2×–10×, …) with markers, statistics modes, gauges, critical
  ranges and alarm actions; marker with harmonics; value logging.
- **Peak detection:** a setting of the signal window with peak markers, feeding the Peak count and Average peak
  distance instruments, with six methods: reference-checked threshold (see below); prominence with minimum height,
  distance and width (matches `scipy.signal.find_peaks`); N highest peaks; smoothed-derivative slope; adaptive moving
  z-score (lag, threshold, influence); wavelet ridge lines (matches `scipy.signal.find_peaks_cwt`). All can mark
  valleys and refine positions between samples (parabola or Gaussian). Signal tools ▸ Copy detected peaks copies
  X/Y. `test/fixtures/make_peaks_scipy.py` writes the SciPy reference results checked by `test/dsp.test.js`.
- **3D tools:** spectrogram/mesh views (the mesh a smoothly shaded, z-buffered surface in a 3D box, linear or dB, turned and
  tilted by dragging, zoomed by the wheel, the point under the pointer read out; time FFT with zero padding, averaging of
  consecutive spectra and a frequency band), 13 palettes, 3D cursor (Tab, click, arrow keys) with its two cross sections
  drawn over the surface and cross-section windows that follow it, max slices, max tracking, 3D filter, time-FFT statistics,
  band level over time, contour plot.
- **Custom displays:** scatter 2D / 2D+colour / 3D (drag to rotate), orbit, polar, Bode, Bode + Nyquist, box, violin,
  box + violin, corner and correlation plots.
- **Scripts:** JavaScript script windows in five kinds (signal, custom display, signal source, instrument, instrument
  source) with editable parameters, and a console. They replace the original's Julia scripts with the same
  `process(input_windows, output)` structure.
- **Acquisition:** sound-card input (mono/stereo), continuous / last block / timed / triggered (level, slope,
  pre-trigger, re-arm), calibration profiles, file logging with size-based splitting.
- **AI signal report:** sends computed metrics (never raw samples) to Anthropic (default `claude-opus-5-5`) or an
  OpenAI-compatible endpoint; export metrics as JSON; copy the prompt; speech-to-text via an OpenAI-compatible
  transcription endpoint. API keys are stored only on this computer.
- **Cursors:** harmonic cursor (lines at 2×, 3×, … of the cursor position) and sideband cursor (cursor ± k·offset)
  from the window's context menu or Instruments; hold SPACE for the X/Y value of every line, SPACE + mouse wheel
  changes the sideband offset in 1 % steps; with a selection the sideband offset is its width. Enter pins the cursor
  at the mouse position (Shift+Enter: on the highest value near the mouse) so it stays as lines only – it adds no
  value boxes to the graph (hold SPACE to read the values, or switch on "Show values of the pinned cursor"); Enter
  again re-pins, Esc releases. The pin is saved with the workspace.
- **Custom tools:** Signal tools ▸ Use custom tool (also under File) lists the built-in tools in groups
  (FFT variants, Network, Plots, Serial, Wavelets) and your saved tools, plus "From file…" (.ost, or an FFT settings
  .swt). File ▸ Save window as custom tool ▸ Window only / Window and its subtree / Subtree only saves to
  `Documents\OpenSig\Tools` (desktop app; any .ost put there is listed) or to the browser, with an optional menu
  group; saved tools can go on the toolbar buttons T1–T5.
- **Workspace:** save/load with or without data, descriptions, batch processing, auto-save and restore, number formats,
  playback device selection. Every workspace has its tab above the desktop (`js/tabs.js`) with its own windows,
  numbered from 1: a loaded `.osw` opens in a new tab named after the file, + adds an empty one, double-click
  renames, × or a middle click closes, Ctrl+Tab / Ctrl+Shift+Tab step through them. Windows of hidden tabs are not
  drawn; their work is caught up when the tab is shown. Restore at the next start brings back all tabs.
- **Value picker** (Instruments ▸ Value picker, Ctrl+Shift+P, toolbar): in pick mode a click – or Shift+click at any
  time – drops a numbered point on a graph, snapped to the nearest sample, the highest or lowest value near the mouse,
  an interpolated position or the free mouse position; Add pick at X… places one at a typed position. Points show
  "P1  x | y", can be dragged (re-snapped), moved by a sample with ←/→ (Shift: 10) and removed with Delete. The Picked
  values table lists X, Y, ΔX, ΔY and 1/ΔX to the previous point, live, and copies them (tab-separated) or saves CSV.
  Points follow live data and are saved with the workspace. In the Control Window the points of a window are one
  "Picked values (n)" node linked to it, listing "P1 x | y" per point (up to 12, then "+N more" for the table): click a
  line to select that point in its window and Del to remove it; click the node and Del to remove all its points (after
  asking); double-click it for the table; right-click for show / copy / delete. The empty-space menu copies or clears
  the points of the selected windows.
- **Graph style** (Edit ▸ Graph style…, Ctrl+Shift+G, window context menu, palette button): trace style (line, steps,
  bars, area, points), width, points, colour; background, grid colour / solid / dashed / dotted / minor grid; axis and
  text colour, axis width, font size, tick density, number format (automatic, fixed decimals, scientific,
  engineering), frame, axis titles, log axes, fixed Y range; plot title and legend. Presets (theme default, classic
  white, oscilloscope, print, night, high contrast, blueprint, engineering paper), live preview with the dialog
  docked at the side (Cancel restores), apply to one window, all windows of the same kind or all signal windows, use
  as the default for new windows, copy / paste graph style. Saved with workspaces and custom tools.
- **User manual** (Help ▸ Contents / Index / Search, F1, the help button): a help viewer laid out like the Windows HTML
  Help viewer – Hide / Back / Forward / Home toolbar, a Contents tree of books and topics, a keyword Index, full-text
  Search with Title / Location / Rank and highlighted words, the book under each topic title and ◀ ▶ through the
  topics in order. F1 opens the topic of the active window's tool. The topics (`js/helpdata.js`) are written for
  OpenSig; their menu and toolbar pictures are drawn from OpenSig's own menus. Every spectral analysis has a "How it
  is calculated" part with its formulas – FFT result types, the 15 windows with their correction factors, averaging,
  padding, dB, smoothing, weighting, Siegel's test, cross-spectra, coherence, octave bands, spectrogram, CWT,
  cepstrum, Hilbert, SRS, the spectral instruments, FDD / EFDD and MAC – written in TeX and drawn as MathML by
  `js/texmath.js` (a small TeX subset, no library, works offline).
- **Look:** classic style in four window styles – Standard (light blue), Classic grey (1990s 3D bevels, teal desktop),
  Classic blue (2000s rounded blue captions, beige panels) and Glass (late-2000s frosted frames) – chosen in Window ▸
  Window style or Application settings (`data-skin`, light mode only); eight app icons (`js/logos.js`: Application
  settings ▸ App icon, shown on the welcome screen, in About, as the browser tab icon and as the desktop app's window
  and taskbar icon through the `setIcon` host call); with a dark mode – Window ▸ Dark mode (Ctrl+Shift+D), the
  moon button, or Application settings ▸ Dark mode: Off / On / Follow Windows. The desktop app darkens its Windows
  title bar too.

## Classic theme

The classic theme (default) draws windows in a classic Windows style: light-blue captions (gradient on the active window), FFT
windows named `FFT( 1#<parent>)` with a red trace, Y axis from exactly the minimum to the maximum of the visible data,
left and bottom axis lines with short tick marks, ticks at the smallest one-digit step that gives at most 10 intervals
(0.3, 3, 70, …), "sec" as the time unit, and the cursor value in a box at the top of the cursor line instead of a
status line under each signal window (the window's details are in the title tooltip).

## Reference-checked FFT

The FFT window (`DSP.svSpectrum`) reproduces the reference program's FFT window value for value. It was matched against
167 spectra exported from the reference program through its command-line automation (`-saveascii`), covering every
window, result type, dB/dBFS, zero-padding code, conditioning option, averaging mode, smoothing, Siegel's test and X
unit. `test/fft_reference.test.js` re-checks 165 of them (relative deviation ≤ 2·10⁻⁴; the reference WAVs were float32):

- Spectrum bins 1 … nfft/2 (the DC bin is not shown). Magnitude = 2|X|/N′·K, power = magnitude², PSD = 8|X|²/(N′·fs·G),
  real/imaginary = Re/N′, Im/N′; phase comes from the unwindowed spectrum. N′ is the length rounded down to even.
- The reference program's window definitions (e.g. Hann = sin²(π(i+1)/(N+1))) with fixed amplitude (K) and noise-bandwidth (G)
  constants per window.
- Zero padding: Never (even length), Optimal (smallest even 2·3·5-smooth length), next power of 2, 2×/4×/8×.
- Segment averaging: L = ⌊N/(k − (k−1)·overlap)⌋, hop = ⌊L·(1 − overlap)⌋, only segments ending before the last sample;
  values averaged linearly, or the complex spectra when "Average complex spectra" is on.
- Mean removed when "Subtract mean" or a window is on; dB/dBFS (full scale 0 = relative to the maximum); smoothing with a
  Hann-weighted moving average on the displayed values; X axis in Hz, CPM, kHz or MHz.
- Known deviations: Siegel's peak test matches the reference on noisy signals but not on a clean two-tone leakage
  skirt; window code 15 (not offered in the reference program's list) is not reproduced.

Signal tools ▸ Import FFT settings opens `.swt` tools (e.g. the FFT variant presets) and `.sws` workspaces;
"Save FFT settings as .swt tool" writes a `.swt` file.

## Reference-checked peak detection

Signal tools ▸ Peak detection… (also in the window's context menu) works like the reference program's peak detector: it is a
setting of the signal window, marks every peak in the visible part with its X position and value, and the Peak count and Average
peak distance instruments read it. `DSP.svPeaks` was matched against 188 signals measured in the reference program
through its automation interface (`-getvalue` on Peak count and Average peak distance instruments);
`test/peaks_reference.test.js` checks them:

- Positive peaks: the first maximum of each part above the positive threshold (strictly). Negative peaks: the first
  minimum of each part below the negative threshold, which is a level, not a magnitude (enter −0.5 for peaks below −0.5).
  Parts shorter than the minimal width (in samples) are skipped, for negative parts as well.
- "Allow multiple peaks inside one threshold crossing": every strict local maximum ≥ the positive threshold (minimum ≤
  the negative one) that is also the largest value within ±⌊width/2⌋ samples; flat tops do not count, nor do the first
  and the last visible sample.
- The last visible sample ends a part but does not count towards its peak or width; on its own it is a peak when the
  sample after it is not above the threshold.
- Defaults: positive threshold = minimum + 75 % of the signal range, negative threshold = minimum + 25 %, width 1.
- Average peak distance = (X of the last peak − X of the first) / (count − 1), 0 below two peaks.
- Known deviation: when the very last sample of a signal starts a peak, the reference program reads memory past the
  end of the signal and reports either result; OpenSig counts that peak. The 22 measurements this affects are skipped.

## Reverse-engineering basis

The feature inventory came from the reference program's installed executable (64-bit MFC) and its shipped data files, inspected
with REA without running the program: the PE resources (main menu, 65 dialog templates, 45 string tables), embedded
strings (window functions, generator types, automation switches), the INI-format workspace/tool files (window trees and
the parameters of the bundled tools), filter, filter-bank, palette and calibration files, and the automation examples.
The look follows the help file's screenshots; all icons and artwork were drawn for OpenSig.

**Not reproduced:** vendor DAQ hardware drivers (NI-DAQmx, LabJack, Measurement Computing, Data Translation, VibDaq,
Sequoia), which need each vendor's SDK and hardware. Also not reproduced: the Julia runtime itself (scripts use
JavaScript instead) and everything related to registration, licensing and online ordering.
