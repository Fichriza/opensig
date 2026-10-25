/* OpenSig User Manual – the topics shown by the help viewer (help.js). Written for OpenSig; no text from any other
   product's manual. Markup helpers: L(id[, text]) links a topic, P(…) is a menu path, K(…) a key, MENU(menu[, sub]) and
   TB(…button titles) show OpenSig's own menu or toolbar buttons, KEYS() the keyboard table. Each topic: T(id, title,
   index keywords, html). Each book: B(id, title, intro html, topics). */
(function (root) {
  'use strict';
  const L = (id, t) => `<a data-t="${id}">${t || ''}</a>`;
  const P = (...a) => `<span class="hv-path">${a.join(' ▸ ')}</span>`;
  const K = (...k) => k.map(x => `<kbd>${x}</kbd>`).join('+');
  const MENU = (m, sub) => `<div class="hv-shot" data-menu="${m}|${sub || ''}"></div>`;
  const TB = (...t) => `<div class="hv-shot" data-tb="${t.join('|')}"></div>`;
  const SHOT = (tb, m, sub, hl) => `<div class="hv-shot hv-combo" data-tb="${tb.join('|')}" data-menu="${m}|${sub || ''}|${hl || ''}"></div>`;
  const NOTE = t => `<p class="hv-note"><b>Note:</b> ${t}</p>`;
  const TIP = t => `<p class="hv-note hv-tip"><b>Tip:</b> ${t}</p>`;
  const SEE = (...ids) => `<p class="hv-see"><b>See also:</b> ${ids.map(i => L(i)).join(', ')}</p>`;
  const T = (id, title, kw, html) => ({ id, title, kw, html });
  const B = (id, title, html, topics) => ({ id, title, html, topics, book: true });
  const KEYS = () => '<div class="hv-keys"></div>';
  // formulas in TeX, drawn as MathML (texmath.js): EQ`…` on a line of its own, M`…` inside the text
  const EQ = (s, ...v) => `<div class="hv-eq">${root.TEXMATH.toMathML(String.raw(s, ...v), true)}</div>`;
  const M = (s, ...v) => root.TEXMATH.toMathML(String.raw(s, ...v));

  const books = [
    B('intro', 'Introduction', '<p><i>OpenSig</i> is a workbench for looking at, measuring and transforming signals: sound, vibration, sensor data or any series of numbers. This part explains the ideas the rest of the manual builds on.</p>', [
      T('welcome', 'Welcome to OpenSig', ['start', 'overview', 'features'], `
<p><i>OpenSig</i> shows signals in windows and lets you build analyses on top of them: spectra, filters, spectrograms, measurements and more. Every analysis is a window of its own, linked to the window it was made from, so changing, zooming or playing a signal updates everything that depends on it.</p>
<p>You can use it in two ways:</p>
<ul><li><b>Desktop app</b> – <code>OpenSig.exe</code>, a single file for 64-bit Windows 10/11. It adds native Open/Save dialogs, recent files, logging to folders, network and serial ports, EMF pictures and command-line automation.</li>
<li><b>Mac app</b> – <code>OpenSig.app</code> for macOS 12 or newer. Shortcuts use ⌘ instead of Ctrl and ⌥ instead of Alt; ⌘Q quits, so the acquisition dialog is ⌃Q there.</li>
<li><b>Web page</b> – the same program in a browser. Files stay on your computer; nothing is uploaded.</li></ul>
<h2>Where to start</h2>
<ul><li>${L('linked')} – the one idea to understand first.</li>
<li>${L('opening')} or ${L('generator')} – get a signal on screen.</li>
<li>${L('fft')} – your first spectrum, then ${L('instruments')} to measure it.</li>
<li>${L('geometry')} – 3D models, mode shapes and damping of structures from vibration measurements.</li>
<li>${L('examples')} – ready-made analyses to explore.</li>
<li>${L('keys')} – every shortcut on one page.</li></ul>
${TIP(`Press ${K('F1')} in any window to open the topic for that window's tool.`)}`),
      T('linked', 'Linked windows', ['parent', 'child', 'tree', 'recalculate', 'link', 'concept'], `
<p>Everything in <i>OpenSig</i> happens in windows. A window either holds a <b>source</b> signal (opened from a file, generated, acquired or pasted) or an <b>analysis</b> calculated from another window – its <b>parent</b>.</p>
<p>When you choose a tool, for example ${P('Signal tools', 'FFT spectrum analysis')}, the tool works on the active window and its result opens in a new <b>child</b> window. The child stays linked: whenever the parent changes, the child recalculates. Children can have children of their own, so you can chain a filter, a spectrum and an instrument in a few clicks.</p>
<h2>The visible part matters</h2>
<p>Spectral tools and instruments use only the <b>visible part</b> of their parent. Zoom into a signal and its FFT shows the spectrum of that part only. Play the signal (${K('F5')}) and the visible part moves through it – every linked window below follows, which turns a static analysis into an animation over time.</p>
<h2>Breaking and restoring the link</h2>
<ul><li>${P('System control', 'Unlink window from parent')} (${K('Alt', 'U')}) freezes a window with its last result. Its title is shown in italics.</li>
<li>${P('System control', 'Link window to parent…')} (${K('Alt', 'L')}) links a window to another parent, so the same analysis can be applied to a different signal.</li></ul>
<p>The ${L('control')} draws the whole tree of windows and lets you work on many windows at once.</p>
${SEE('control', 'zoom', 'play')}`),
      T('desktop', 'The OpenSig desktop', ['menu', 'toolbar', 'status bar', 'user interface', 'window menu', 'context menu'], `
<p>The main window has a menu bar, two toolbar rows, the desktop where signal windows live, and a status bar.</p>
${TB('Open signal', 'Save signal', 'FFT with default settings', 'Spectrogram', 'FFT filter', 'Signal calculator', 'Signal generator')}
<ul><li><b>Menu bar</b> – every command. Items that need a certain kind of window are disabled until such a window is active.</li>
<li><b>Toolbars</b> – the most used commands; hover a button to see its name and shortcut. The second row holds the instrument buttons and the custom tool buttons T1–T5. The large button at the right end, as tall as both rows, opens a new ${L('geometry')}.</li>
<li><b>Workspace tabs</b> – every workspace has its tab above the desktop; see ${L('workspaces')}.</li>
<li><b>Desktop</b> – windows can be moved by their caption, resized at the corner, maximised with a double-click on the caption and arranged with ${P('Window', 'Cascade')}, ${P('Window', 'Tile')} or ${P('Window', 'Organize')}. <b>Organize</b> keeps each signal together with the windows made from it: one band across the desktop per signal, its graphs side by side and its instruments in a narrow column at the right. A window made from several signals (a 3D geometry, a calculator result) gets the right half of its band, and instruments whose window was closed go into a strip along the bottom. With ${P('Window', 'Organize automatically')} it does this again whenever a window opens or closes, or the OpenSig window changes size.</li>
<li><b>Window menu</b> – right-click a window (or use the ⋯ button on its caption) for the commands that fit it.</li>
<li><b>Status bar</b> – the active window, its parent, the visible range, the play step and the sampling rate.</li></ul>
<p>Files can be dropped onto the desktop to open them.</p>
${SEE('keys', 'looks')}`),
      T('keys', 'Keyboard and mouse', ['shortcuts', 'hotkeys', 'mouse', 'keyboard', 'F1'], `
<p>Mouse actions in a graph:</p>
<table class="hv-table"><tr><th>Action</th><th>Result</th></tr>
<tr><td>Drag</td><td>Zoom to the selected range (2D) or rectangle (3D)</td></tr>
<tr><td>Double-click</td><td>Reset the zoom</td></tr>
<tr><td>Mouse wheel</td><td>Zoom the X axis around the pointer (${K('Shift')}: the Y axis)</td></tr>
<tr><td>Right-drag or ${K('Ctrl')}+drag</td><td>Pan</td></tr>
<tr><td>Click</td><td>Set the fixed cursor</td></tr>
<tr><td>${K('Shift')}+click</td><td>Pick a value (${L('picker')})</td></tr>
<tr><td>Right-click</td><td>Window menu</td></tr>
<tr><td>Hold ${K('Space')}</td><td>Show the values of harmonic / sideband cursors</td></tr></table>
<p>Keyboard shortcuts:</p>
${KEYS()}
${SEE('zoom', 'cursors', 'harmonic')}`),
      T('looks', 'Window styles and dark mode', ['dark', 'theme', 'style', 'window style', 'classic', 'grey', 'blue', 'glass', 'skin', 'night', 'colours'], `
<p><i>OpenSig</i> looks like classic Windows: windows with captions, white graphs, black axes and short tick marks. ${P('Window', 'Window style')} – or the <b>Window style</b> setting in ${P('File', 'Application settings…')} – chooses how the frames, menus, toolbars and dialogs look:</p>
<table class="hv-table"><tr><th>Window style</th><th>Look</th></tr>
<tr><td>Standard (light blue)</td><td>Flat frames with light-blue captions – the default</td></tr>
<tr><td>Classic grey (1990s)</td><td>Grey 3D bevels, navy-to-blue captions and a teal desktop</td></tr>
<tr><td>Classic blue (2000s)</td><td>Rounded blue captions, beige panels and buttons with an orange glow</td></tr>
<tr><td>Glass (late 2000s)</td><td>Frosted light-blue frames, gradient buttons and a deep-blue desktop</td></tr></table>
<p>The graphs look the same in every style. Dark mode keeps the layout with dark colours, and uses them whichever window style is chosen.</p>
<h2>App icon</h2>
<p>The <b>App icon</b> setting in ${P('File', 'Application settings…')} picks the OpenSig logo: <i>Blue wave</i> (the default), <i>Black wave</i> (the same on black), <i>Oscilloscope</i>, <i>Spectrum</i>, <i>Spectrogram</i>, <i>Mode shape</i>, <i>Retro grey</i> or <i>Black and white</i>. It appears on the welcome screen, in ${P('Help', 'About OpenSig…')} and in the browser tab, and in the desktop app as the window and taskbar icon. The icon of the program file itself – in the Start menu, on shortcuts and in the Mac Dock – stays the blue wave.</p>
<p>Dark mode can be switched with ${P('Window', 'Dark mode')} (${K('Ctrl', 'Shift', 'D')}), the moon button on the toolbar, or in ${P('File', 'Application settings…')}, where it can also follow Windows. The desktop app darkens its title bar as well.</p>
<p>The colours, grid and axes of single graphs can be changed further with ${L('graphstyle')}.</p>`),
      T('about', 'About OpenSig', ['version', 'license', 'privacy', 'clean-room'], `
<p><i>OpenSig</i> is an independent, clean-room signal analysis program. It contains no code, help text, artwork or licensing logic from other programs and is not affiliated with any other software vendor.</p>
<p>All calculations run on your computer. Only the ${L('ai', 'AI signal report')} sends data elsewhere, and only computed metrics, never raw samples, and only when you ask for it.</p>`)
    ]),

    B('start', 'Getting Started', '<p>How to get signals into <i>OpenSig</i>, and how to save your results and your work.</p>', [
      T('opening', 'Opening signals', ['open', 'file formats', 'WAV', 'CSV', 'ASCII', 'MAT', 'NumPy', 'EDF', 'HDF5', 'raw', 'import', 'drag and drop'], `
<p>Use ${P('File', 'Open signal…')} (${K('Ctrl', 'O')}), the open button, or drop files on the desktop. Supported formats:</p>
<table class="hv-table"><tr><th>Format</th><th>Notes</th></tr>
<tr><td>WAV</td><td>8/16/24/32-bit and float, any number of channels; display settings saved by OpenSig are restored</td></tr>
<tr><td>FLAC, MP3, OGG, AIFF, M4A</td><td>Decoded audio</td></tr>
<tr><td>ASCII / CSV</td><td>One or more columns; ${P('File', 'ASCII / CSV files', 'Import ASCII / CSV…')} asks for separators, header lines and the sampling rate. A file that another program keeps writing can be ${L('followcsv', 'followed')}.</td></tr>
<tr><td>Raw binary</td><td>32-bit float, 16-bit and 8-bit signed or unsigned, from ${P('File', 'Raw binary files', 'Import')}</td></tr>
<tr><td>MATLAB .mat</td><td>Version 5 (also compressed, with structs) and 7.3</td></tr>
<tr><td>NumPy .npy / .npz</td><td>Numeric arrays</td></tr>
<tr><td>EDF, BDF, GDF</td><td>Biomedical recordings</td></tr>
<tr><td>HDF5, JLD2, NetCDF-4</td><td>A dialog lets you choose the signals</td></tr>
<tr><td>UFF / UNV</td><td>Dataset 58</td></tr>
<tr><td>.sig + .txt</td><td>Data logs written by ${L('logging', 'data logging')}</td></tr>
<tr><td>.osw / .ost</td><td>${L('workspaces')} and ${L('customtools')}</td></tr></table>
<p>Each channel of a multi-channel file opens in its own window. ${P('File', 'Signal from clipboard data… (ASCII / CSV)')} turns copied numbers into a signal.</p>
${NOTE('In the desktop app, File ▸ Recent signals lists the last files, and File ▸ Replace signal with… swaps the data of a source window while keeping every analysis linked to it.')}
${SEE('saving', 'generator', 'followcsv')}`),
      T('followcsv', 'Following a CSV file that keeps growing', ['follow', 'live file', 'logger', 'updating', 'growing', 'tail', 'monitor', 'CSV'], `
<p>${P('File', 'ASCII / CSV files', 'Follow updating CSV file…')} (also in the ${P('Data acquisition')} menu) shows a CSV file that another program keeps writing – a data logger, a test rig, a PLC export – and updates the windows as the file changes. Windows made from them (FFT, filters, instruments) follow, as for live input.</p>
<p>After you choose the file, the usual import settings apply (separator, number format, header row, ignored columns, time column or sample rate), plus three more:</p>
<ul><li><b>Read the file again every … seconds</b> – how often the file is checked (1 s unless you change it).</li>
<li><b>The program writing the file</b> – <i>adds rows at the end</i> (a logger): only the new rows are read, and a row that is still being written waits for its line end. If the file gets shorter (a new file under the same name), it is read from the beginning. <i>writes the whole file again</i>: every change replaces the content of the windows.</li>
<li><b>Keep the last … seconds</b> – older rows leave the windows, so a long run does not fill the memory; 0 keeps everything.</li></ul>
<p>Each column opens in its own window. Its status line shows the file and the number of rows, and the status bar shows <b>● Following</b>. A window zoomed to the end of the signal keeps showing the newest rows; one zoomed elsewhere stays where it is. If the file cannot be read for a moment, a warning shows in the windows and OpenSig keeps trying. In the desktop app the file is read while the other program keeps it open.</p>
<p>${P('Data acquisition', 'Stop following CSV files')} stops; closing the windows of a file stops following it too. The windows keep the data read so far.</p>
${NOTE('Following works in the Windows desktop app and in Chrome or Edge. Safari and the Mac app cannot read a file again once it is open. A time column must hold seconds as numbers.')}
${SEE('opening', 'logging')}`),
      T('video', 'Videos in step with signals', ['video', 'movie', 'MP4', 'WebM', 'MOV', 'camera', 'synchronize', 'sync', 'offset', 'frame', 'playback', 'attach video'], `
<p>${P('File', 'Open video…')} – or a video file dropped on the desktop – opens a video in a <b>video window</b> and its sound as signal windows, one per channel. The video window is linked to the first sound channel and plays in step with it, so you can see what made a sound or a vibration while you analyse it.</p>
<h2>How the video follows its signal</h2>
<ul><li>While the signal plays with sound (${K('Alt', 'F6')}, ${K('F6')} from the cursor, ${K('Ctrl', 'Alt', 'F6')} the visible part), the video plays along – without its own sound, so you hear the signal only.</li>
<li>While the signal plays without sound (${K('F5')}), the video shows the frame at the end of the visible part as it steps through the record.</li>
<li>Otherwise it shows the frame at the signal's cursor (click in the signal), or at the start of the visible part – zoom or scroll the signal and the picture follows.</li>
<li>Played with its own controls (▶, the time bar), the video draws a red playhead over the signal; where you stop it or move it, it puts the signal's cursor – press ${K('F6')} to hear the signal from there.</li></ul>
<h2>The video window</h2>
<ul><li><b>Open video…</b> – another file in this window.</li>
<li><b>Sync with signal…</b> – any time signal can lead the video: the sound of the video, or an accelerometer, strain gauge or microphone recorded beside a camera. ${P('Attach a video…')} in a signal window's menu opens a video synced with that signal.</li>
<li><b>Offset</b> – the signal time at which the video starts. A camera started 2.5 s after the recorder has an offset of 2.5; a negative offset means the video started first.</li>
<li><b>◀ ▶</b> – one frame back or on (1/30 s); <b>Sound</b> – the video's own sound when it plays by itself.</li></ul>
<h2>Files</h2>
<p>A video plays when OpenSig's browser engine can decode it: MP4 (H.264 or AV1 with AAC), WebM (VP8, VP9 or AV1 with Opus or Vorbis), Ogg, and MOV with H.264; on a Mac, MP4 and MOV play best. The desktop app streams the file from the disk, so its size does not matter; opening its sound reads the whole file (above 400 MB OpenSig asks first). A workspace keeps the video window with its offset; the desktop app opens the file again from where it was, in a browser the window asks for it.</p>
${SEE('opening', 'play', 'linked')}`),
      T('generator', 'Signal Generator', ['generate', 'sine', 'noise', 'sweep', 'chirp', 'test signal'], `
<p>${P('Signal tools', 'Signal generator…')} creates test signals. Choose the signal type, the sampling rate, the length in seconds and the minimum and maximum amplitude.</p>
<ul><li><b>Periodic:</b> sine, cosine, square, triangular and sawtooth, with a frequency.</li>
<li><b>Steps:</b> step and constant.</li>
<li><b>Noise:</b> white, Gaussian, pink and exponential noise.</li>
<li><b>Sweep:</b> a linear or logarithmic frequency sweep between a start and an end frequency.</li></ul>
<p>Generated signals behave like any opened signal. Combine them with the ${L('calculator')}, for example a sine plus noise.</p>`),
      T('examples', 'Examples', ['demo', 'tutorial', 'samples'], `
<p>${P('Help', 'Examples')} builds complete analyses from generated signals, so you can see how windows link together:</p>
${MENU('Help', 'Examples')}
<p>Each example opens its signals and analysis windows. Change the source (zoom, play, edit) and watch the analyses follow.</p>`),
      T('saving', 'Saving signals and pictures', ['save', 'export', 'WAV', 'CSV', 'PNG', 'EMF', 'clipboard', 'picture'], `
<ul><li>${P('File', 'Save signal as…')} (${K('Ctrl', 'S')}) writes the whole signal as WAV, CSV or text; ${P('File', 'Save visible signal part as…')} only the visible part.</li>
<li>${P('File', 'ASCII / CSV files')} exports X/Y values, and 3D windows as triples or matrices.</li>
<li>${P('File', 'Raw binary files', 'Export')} writes plain sample values.</li>
<li>${P('Edit', 'Copy data to clipboard (ASCII / CSV)')} (${K('Ctrl', 'B')}) copies the visible values for a spreadsheet.</li>
<li>${P('Edit', 'Copy picture to clipboard')}, ${P('Edit', 'Save picture as PNG…')} and, in the desktop app, Enhanced Metafile (EMF) save the graph as an image.</li></ul>
${SEE('workspaces', 'opening')}`),
      T('workspaces', 'Workspaces and their tabs', ['workspace', 'osw', 'tab', 'tabs', 'save session', 'restore', 'auto-save'], `
<p>A workspace stores every window – sources, analyses, their settings, positions, cursors, picked values and graph styles – so you can continue later.</p>
<ul><li>${P('File', 'Save workspace (with data)…')} (${K('Ctrl', 'I')}) stores the signal data in the file.</li>
<li>${P('File', 'Save workspace (file references only)…')} stores the file names instead; when loaded, the files are read again. Use it to apply the same analysis to new recordings.</li>
<li>${P('File', 'Load workspace…')} (${K('Ctrl', 'L')}) opens one in a tab of its own.</li>
<li>${P('File', 'Workspace description…')} adds a note that is shown when the workspace is loaded.</li></ul>
<h2>Workspace tabs</h2>
<p>Every workspace has its own tab above the desktop, with its own windows, numbered from 1. A workspace file opens in a new tab named after the file (an empty tab is used for it), and a saved workspace file is named after its tab.</p>
<ul><li>Click a tab to show its windows; ${K('Ctrl', 'Tab')} and ${K('Ctrl', 'Shift', 'Tab')} step through the tabs in the desktop app (${P('Window', 'Next workspace tab')}).</li>
<li><b>+</b> at the end of the tabs, or ${P('Window', 'New workspace tab')}, adds an empty workspace.</li>
<li>Double-click a tab to rename it (${P('Window', 'Rename workspace tab…')}).</li>
<li>× on a tab, a middle click or ${P('Window', 'Close workspace tab')} closes the tab and its windows, after asking when it has any.</li></ul>
<p>Windows can only be linked within their own tab. Windows of a tab that is not shown are not drawn: a running acquisition keeps recording, and the tab's analyses are brought up to date when you show it again. Switching tabs stops sound playback.</p>
<p>The application settings can save all workspace tabs automatically and open them again at the next start.</p>
${SEE('batch', 'customtools')}`),
      T('batch', 'Batch file processing', ['batch', 'automation', 'command line', 'script generator'], `
<p>${P('File', 'Batch file processing…')} runs the current set of analysis windows over many files: each file replaces the source signal in turn, and the results (instrument values, saved signals or pictures) are written to a folder.</p>
<p>In the desktop app, ${P('File', 'Batch file processing script generator…')} writes a <code>.bat</code> file built on the command-line switches of <code>OpenSig.exe</code>, for example <code>-loadsws</code>, <code>-getvalue</code> and <code>-saveascii</code>. Run <code>OpenSig.exe -help</code> for the full list.</p>`)
    ]),

    B('displaybook', 'Signal Display', '<p>Navigating, measuring by eye and styling the graphs.</p>', [
      T('zoom', 'Zooming and navigating', ['zoom', 'pan', 'scroll', 'navigate', 'reset zoom', 'step'], `
<p>Drag over a graph to zoom to that range; double-click to reset. The mouse wheel zooms around the pointer and right-drag pans. ${P('Edit', 'Zoom to X samples/values…')} (${K('Ctrl', '2')}) sets an exact width.</p>
<p>${P('Play & navigate')} moves the visible part: ${K('Home')} and ${K('End')} jump to the beginning and the end, ${K('←')} and ${K('→')} step by the play step, and ${P('Play & navigate', 'Go to sample…')} jumps to a position. ${P('Edit', 'Open selection in new window')} (${K('Ctrl', 'E')}) copies the visible part into a new source window.</p>
<p>${P('System control', 'Reset all windows (zoom)')} (${K('Ctrl', 'D')}) resets every window at once.</p>
${SEE('play', 'axes')}`),
      T('play', 'Playing signals', ['play', 'animate', 'sound', 'audio', 'loop', 'F5', 'F6'], `
<p>Playing moves the visible part of a signal step by step through it. Every linked analysis recalculates at each step, so spectra, spectrograms and instruments run like a live measurement.</p>
<ul><li>${K('F5')} plays without sound; ${P('Play & navigate', 'Play as fast as possible (no sound)')} skips the waiting.</li>
<li>${K('F6')} plays with sound from the cursor position; ${K('Alt', 'F6')} from the beginning; ${K('Ctrl', 'Alt', 'F6')} only the visible segment.</li>
<li>${K('F7')} stops. ${P('Play & navigate', 'Play in loop')} repeats.</li>
<li>${P('Play & navigate', 'Step change…')} (${K('Alt', '↑')} / ${K('Alt', '↓')}) sets how far each step moves.</li></ul>`),
      T('cursors', 'Cursors and values', ['cursor', 'value', 'marker', 'value at', 'sample units'], `
<p>Click a graph to set the <b>fixed cursor</b>. Its X and Y values are shown in a box at the top of the cursor line. The cursor is used by "play from cursor", ${P('Instruments', 'Value at (with marker)…')} and the 3D extract commands.</p>
<p>${P('Edit', 'Cursor in "sample" units')} shows positions as sample numbers instead of time.</p>
${SEE('harmonic', 'picker', 'markers')}`),
      T('harmonic', 'Harmonic and sideband cursors', ['harmonic cursor', 'sideband cursor', 'pin', 'Enter', 'harmonics', 'sidebands'], `
<p>Two special cursors help to find related frequencies in a spectrum:</p>
<ul><li><b>Harmonic cursor</b> – lines at 2×, 3×, 4×… the mouse position.</li>
<li><b>Sideband cursor</b> – lines at the mouse position ± 1, 2, 3… times an offset. Set the offset in ${P('Instruments', 'Sideband cursor offset…')}, by selecting a range (its width becomes the offset), or with ${K('Space')}+mouse wheel in 1 % steps.</li></ul>
<p>For a cursor at the frequency ${M`f`}, the harmonic cursor draws lines at ${M`h\cdot f`} (${M`h=2,3,4\ldots`}) and the sideband cursor at ${M`f\pm m\,\Delta`} (${M`m=1,2,3\ldots`}), where ${M`\Delta`} is the offset.</p>
<p>Switch them on in ${P('Instruments')} or the window menu. Hold ${K('Space')} to show the X/Y value of every line.</p>
<h2>Pinning</h2>
<p>Press ${K('Enter')} to pin the cursor set where the mouse is; ${K('Shift', 'Enter')} pins it on the highest value near the mouse. A pinned set stays as lines when the mouse moves away and adds no value boxes to the graph – hold ${K('Space')} to read the values, or switch on ${P('Instruments', 'Show values of the pinned cursor')}. ${K('Enter')} again re-pins, ${K('Esc')} releases. The pin is saved with the workspace.</p>`),
      T('axes', 'Axes settings', ['axes', 'axis', 'range', 'logarithmic', 'scale', 'units', 'title'], `
<p>${P('Edit', 'Axes settings…')} (${K('Ctrl', 'A')}) sets the X and Y ranges, a fixed or automatic Y range, logarithmic axes, units and axis titles. The automatic Y range follows the minimum and maximum of the visible data.</p>
<p>${P('Edit', 'Sample rate change (w/o resampling)…')} and ${P('Edit', 'Edit signal time…')} change how sample positions map to time without changing the values. ${P('Edit', 'Show absolute time on X-axis')} shows clock time for signals that know their start time.</p>
${SEE('graphstyle', 'display')}`),
      T('display', 'Display style', ['line', 'steps', 'histogram', 'area', 'dots', 'colour', 'line width', 'persistence'], `
<p>${P('Edit', 'Display style')} changes how the trace is drawn:</p>
${MENU('Edit', 'Display style')}
<p>${P('Edit', 'Persistence display')} keeps fading copies of earlier traces while a signal plays – useful to see how a spectrum varies.</p>
${SEE('graphstyle')}`),
      T('graphstyle', 'Graph style', ['graph style', 'colours', 'grid', 'presets', 'font', 'number format', 'legend', 'copy style'], `
<p>${P('Edit', 'Graph style…')} (${K('Ctrl', 'Shift', 'G')}, the palette button or the window menu) changes everything about a graph's look. The dialog docks at the side and the graph updates as you change it; Cancel restores the old look.</p>
<ul><li><b>Trace:</b> line, steps, bars, area or points; width, point size and colour.</li>
<li><b>Background and grid:</b> colours, solid / dashed / dotted grid, minor grid.</li>
<li><b>Axes:</b> axis and text colour, axis width, font size, tick density, number format (automatic, fixed decimals, scientific, engineering), frame, titles, logarithmic axes, fixed Y range.</li>
<li><b>Title and legend.</b></li></ul>
<p>Presets give a complete look in one click: theme default, classic, oscilloscope, print, night, high contrast, blueprint and engineering paper. Apply the style to this window, to all windows of the same kind or to all signal windows, or make it the default for new windows. ${P('Edit', 'Copy graph style')} and ${P('Edit', 'Paste graph style')} transfer a look between windows.</p>`),
      T('overlay', 'Overlays and stacked signals', ['overlay', 'compare', 'stacked', 'same window', 'multiple signals'], `
<p>${P('System control', 'Show signals as overlay…')} draws other signals on top of the active window, each in its own colour, to compare them directly. ${P('System control', 'Show signals in a same window (stacked)')} draws them one above the other, each band labelled with its window number (W1, W2 …). The X axis is drawn once, under the bottom signal, so every band gets the same height: a signal needs about 30 pixels to stay readable, which is about 17 signals in a window 550 pixels high and about 27 in a maximised window on a 1080p screen.</p>
<p>The ${L('control')} can do the same for all selected windows.</p>`),
      T('properties', 'Window properties', ['properties', 'title', 'description', 'settings of a window'], `
<p>${P('Edit', 'Properties…')} (${K('Ctrl', 'P')}) shows the settings of the active window. For an analysis window it opens the tool's own dialog, so you can change, for example, the FFT parameters of an existing spectrum; the window recalculates with the new settings.</p>
<p>${P('Edit', 'Change window title…')} renames a window and ${P('Edit', 'Edit window description…')} attaches a note to it.</p>`),
      T('control', 'Control Window', ['control window', 'tree', 'graph of windows', 'select windows', 'Alt+W', 'rename', 'node name', 'window name', 'F2'], `
<p>${P('System control', 'Control window')} (${K('Alt', 'W')}) shows every window as an icon, with lines from each parent to its children – dotted when a child is unlinked, coloured for the inputs of windows with several inputs and for overlays. Hidden windows are marked "H".</p>
<ul><li>Click an icon to select it (numbers show the order); drag a rectangle to select several; ${K('Ctrl')}+drag unselects.</li>
<li>Double-click an icon to bring the window forward; ${K('Del')} deletes the selection.</li>
<li><b>Rename a node</b> (and its window): double-click the name under the icon, press ${K('F2')} after clicking the icon, or right-click the icon and choose <span class="hv-path">Rename…</span>. Type the new name and press ${K('Enter')}; ${K('Esc')} cancels. The window's title bar shows the same name, and it is saved with the workspace and kept when you change the window's settings. To give an analysis window its automatic name back (for example "3 (2592)"), clear the name or choose <span class="hv-path">Use the automatic name</span>; a source signal always keeps a name.</li>
<li>Right-click an icon for its window menu, or empty space for the commands on all selected windows: hide/show/delete, save as one multi-channel WAV or CSV, overlay, average, concatenate, FFT, spectrogram, filter or a custom tool on all of them, zoom, unlink and relink.</li>
<li><b>Arrange the icons freely:</b> drag an icon to any place – all selected icons move together – or nudge the selection with the arrow keys (${K('Shift')}: one pixel). Icons snap to a small grid unless <span class="hv-path">Snap icons to grid</span> is off in the empty-space menu. The places are saved with the workspace; <span class="hv-path">Arrange icons automatically</span> brings back the tree layout.</li>
<li>Drop an icon <b>onto another</b> to copy its analysis there (${K('Ctrl')}: move it). Hold ${K('Shift')} when dropping a source on empty space to duplicate it with its analysis.</li></ul>
<p>The picked values of a window are one "Picked values" node linked to it. Click a line to select that point, double-click the node for the table, right-click for more.</p>
${SEE('linked', 'picker')}`)
    ]),

    B('analysis', 'Signal Analysis', '<p>The tools in the <span class="hv-path">Signal tools</span> menu. Each opens its result in a new window linked to the active one.</p>', [
      T('fft', 'FFT', ['FFT', 'spectrum', 'frequency', 'magnitude', 'power spectrum', 'PSD', 'phase', 'Ctrl+F'], `
<p>Most spectral tools in <i>OpenSig</i> are based on the Fast Fourier Transform. It turns the visible part of a signal from the time domain into the frequency domain: which frequencies the signal contains, and how strongly.</p>
<p>By preparing the signal before the transform – removing the mean or a trend, applying a window, averaging segments – and by choosing how the result is shown, many variants of a spectrum can be calculated. The settings are described in ${L('fftparams')}.</p>
<p>Predefined combinations are available from the toolbar and from ${P('Signal tools', 'FFT spectrum analysis')}:</p>
${SHOT(['FFT with default settings', 'FFT filter', 'Spectrogram', 'Time FFT'], 'Signal tools', 'FFT spectrum analysis', 'FFT Magnitude, averaged (dB scale)')}
<ul><li>${K('Ctrl', 'F')} calculates an FFT with the default settings (${P('Signal tools', 'Spectral analysis defaults…')}).</li>
<li>${P('Signal tools', 'FFT spectrum analysis', 'FFT with custom settings…')} asks for every parameter first.</li>
<li>To change the settings of an existing FFT window, open its ${L('properties')} (${K('Ctrl', 'P')}).</li></ul>
<p>The FFT window is named after its parent, for example <code>FFT( 1#signal.wav)</code>, and recalculates whenever the parent's visible part changes. Zoom into a signal to see the spectrum of one event, or play it to watch the spectrum change.</p>
${TIP('The FFT has been checked value for value against reference spectra for every window function, result type, averaging mode and scale.')}
<h2>How it is calculated</h2>
<p>The visible part has ${M`N`} samples ${M`x_0\ldots x_{N-1}`} at the sampling rate ${M`f_s`}. With averaging it is cut into segments (see ${L('fftparams')}). Each segment of ${M`L`} samples is conditioned, multiplied by the window ${M`w_n`} and zero-padded to ${M`N_{\mathrm{FFT}}`} points before the transform:</p>
${EQ`X_k=\sum_{n=0}^{L-1}w_n\left(x_n-\bar{x}\right)e^{-i2\pi kn/N_{\mathrm{FFT}}}`}
<p>Line ${M`k=1\ldots N_{\mathrm{FFT}}/2`} lies at the frequency</p>
${EQ`f_k=k\,\Delta f,\qquad\Delta f=\frac{f_s}{N_{\mathrm{FFT}}}`}
<p>The DC line ${M`k=0`} is not shown. ${M`\bar{x}`} is the mean of the segment: it is removed when <b>Subtract mean</b> is on, and always when a window is applied. The result types are:</p>
<table class="hv-table hv-mtable"><tr><th>Show result as</th><th>Formula</th><th>Unit</th></tr>
<tr><td>Magnitude</td><td>${M`M_k=\frac{2K}{L'}\left|X_k\right|`}</td><td>u</td></tr>
<tr><td>Power spectrum</td><td>${M`P_k=M_k^2`}</td><td>u²</td></tr>
<tr><td>Power spectral density (PSD)</td><td>${M`S_k=\frac{8\left|X_k\right|^2}{L'f_sG}`}</td><td>u²/Hz</td></tr>
<tr><td>Phase</td><td>${M`\varphi_k=\frac{180}{\pi}\arg X^{\circ}_k`}</td><td>deg</td></tr>
<tr><td>Real part, Imaginary part</td><td>${M`\frac{\operatorname{Re}X_k}{L'}`}, ${M`\frac{\operatorname{Im}X_k}{L'}`}</td><td>u</td></tr></table>
<p>u is the unit of the signal, ${M`L'`} is ${M`L`} rounded down to an even number, and ${M`K`} and ${M`G`} are the window's amplitude correction and noise factor (see the table of windows in ${L('fftparams')}). With them, a sine of amplitude ${M`A`} gives a magnitude peak of about ${M`A`}, whatever the window. ${M`X^{\circ}_k`} is the transform of the segment without the window, so the window does not change the phase.</p>
<p>Averaging, the dB scale, smoothing and the significance test are then applied to these values; ${L('fftparams')} gives their formulas.</p>
${SEE('fftparams', 'spectrogram', 'fftfilter', 'instruments')}`),
      T('fftparams', 'Changing FFT calculation parameters', ['window function', 'Hann', 'Hamming', 'Blackman', 'flat top', 'zero padding', 'averaging', 'overlap', 'dB', 'dBFS', 'smoothing', 'Siegel', 'A-weighting', 'C-weighting'], `
<p>The FFT dialog (${P('Signal tools', 'Spectral analysis defaults…')}, FFT with custom settings, or the properties of an FFT window) has these groups:</p>
<h2>Averaging</h2>
<ul><li><b>Instantaneous spectrum</b> – one FFT of the whole visible part.</li>
<li><b>Split input in overlapping segments</b> – the visible part is cut into a number of segments that overlap by a percentage; their spectra are averaged. This reduces noise in the spectrum (Welch's method). "Average complex spectra" averages before taking the magnitude.</li>
<li><b>Average last X spectra</b> – for live and played signals, averages the latest results.</li></ul>
<h2>Signal conditioning</h2>
<p>Subtract the mean, remove a linear trend, clip values beyond N standard deviations, and apply a <b>window function</b>: Hann, Hamming, Blackman, rectangle, triangle, Tukey (25 % / 50 %), Kaiser (β = 2/4/8), flat top, Blackman-Harris, Nuttall, Gaussian or exponential. Windows reduce leakage; flat top gives the most exact amplitudes, Hann is a good general choice.</p>
<p><b>Zero-padding</b> lengthens the data before the transform – never, optimal, next power of 2, or 2/4/8 times that – which gives a finer frequency grid.</p>
<h2>Spectrum units</h2>
<p>Logarithmic Y axis (dB), dBFS relative to a full-scale value (predefined bit depths, the maximum, or a value you enter), and the X unit: Hz, CPM (cycles per minute), kHz or MHz.</p>
<h2>Spectrum properties</h2>
<ul><li><b>Show result as</b> magnitude, power spectrum, power spectral density (PSD), phase, real or imaginary part.</li>
<li><b>Custom filter curve</b> – A- or C-weighting, or a curve you imported.</li>
<li><b>Smoothing</b> with a weighted moving average over a number of points.</li>
<li><b>Test for significant peaks</b> (Siegel's test) at 95 % or 99 % confidence.</li>
<li><b>Displayed frequency range</b> – limit the X axis to a band.</li></ul>
${NOTE(`${P('Signal tools', 'Import FFT settings (.swt / .sws)…')} reads FFT settings from <code>.swt</code> tool and <code>.sws</code> workspace files, and ${P('Signal tools', 'Save FFT settings as .swt tool…')} writes them back.`)}
<h2>How the settings are calculated</h2>
<h3>Segments and averaging</h3>
<p>With <b>Split input in overlapping segments</b>, ${M`J`} segments that overlap by the fraction ${M`o`} cover the ${M`N`} visible samples:</p>
${EQ`L=\left\lfloor\frac{N}{J-(J-1)\,o}\right\rfloor,\qquad h=\left\lfloor L\,(1-o)\right\rfloor`}
<p>Segment ${M`j`} starts at sample ${M`jh`}. The results ${M`Y_k`} of the segments – magnitudes, powers or densities – are averaged line by line:</p>
${EQ`\bar{Y}_k=\frac{1}{J}\sum_{j=0}^{J-1}Y_k^{(j)}`}
<p><b>Average complex spectra</b> averages the transforms instead, ${M`\bar{X}_k=\frac{1}{J}\sum_jX_k^{(j)}`}, and calculates the result from ${M`\bar{X}_k`}: components that are not in phase in every segment cancel out. <b>Average last X spectra</b> averages the latest results of a played or live signal, ${M`\bar{Y}_k(t)=\frac{1}{X}\sum_{m=0}^{X-1}Y_k(t-m)`}; nothing is shown until X spectra have been collected.</p>
<h3>Signal conditioning</h3>
<ul><li><b>Subtract mean</b> – ${M`x_n-\bar{x}`} with ${M`\bar{x}=\frac{1}{L}\sum_nx_n`}, per segment.</li>
<li><b>Remove linear trend</b> – the least-squares line through the visible part is subtracted: ${M`x_n-(a+bn)`}, where ${M`a`} and ${M`b`} minimise ${M`\sum_n\left(x_n-a-bn\right)^2`}.</li>
<li><b>Remove values &gt; N · standard deviation</b> – with ${M`c`} the N of the dialog, a sample with ${M`\left|x_n-\bar{x}\right|>c\,\sigma`} is replaced by ${M`\bar{x}`}, where ${M`\sigma=\sqrt{\frac{1}{N}\sum_n\left(x_n-\bar{x}\right)^2}`}.</li></ul>
<h3>Window functions</h3>
<p>For ${M`n=0\ldots L-1`}, with ${M`\theta=\frac{2\pi n}{L-1}`}. ${M`K`} is the window's amplitude correction (one over its mean) and ${M`G`} its noise factor, both used in the formulas of ${L('fft')}:</p>
<table class="hv-table hv-mtable"><tr><th>Window</th><th>${M`w_n`}</th><th>${M`K`}</th><th>${M`G`}</th></tr>
<tr><td>Rectangle</td><td>${M`1`}</td><td>1</td><td>1</td></tr>
<tr><td>Hann</td><td>${M`0.5-0.5\cos\frac{2\pi(n+1)}{L+1}`}</td><td>2</td><td>1.5</td></tr>
<tr><td>Hamming</td><td>${M`0.54-0.46\cos\theta`}</td><td>1/0.54</td><td>1.3676</td></tr>
<tr><td>Blackman</td><td>${M`0.42-0.5\cos\theta+0.08\cos2\theta`}</td><td>1/0.40</td><td>1.7268</td></tr>
<tr><td>Blackman-Harris</td><td>${M`0.35875-0.48829\cos\theta+0.14128\cos2\theta-0.01168\cos3\theta`}</td><td>1/0.36</td><td>2.0</td></tr>
<tr><td>Nuttall</td><td>${M`0.355768-0.487396\cos\theta+0.144232\cos2\theta-0.012604\cos3\theta`}</td><td>1/0.354</td><td>1.5</td></tr>
<tr><td>Flat top</td><td>${M`\frac{1-1.93\cos\theta+1.29\cos2\theta-0.388\cos3\theta+0.028\cos4\theta}{4.636}`}</td><td>4.8955</td><td>0.1596</td></tr>
<tr><td>Triangle</td><td>${M`1-\frac{\left|n-(L-1)/2\right|}{(L+1)/2}`}</td><td>2</td><td>1.33</td></tr>
<tr><td>Tukey (r = 25 %, 50 %)</td><td>${M`\begin{cases}1 & d\ge e\\ \frac{1}{2}\left(1-\cos\frac{\pi d}{e}\right) & d<e\end{cases}`} with ${M`d=\min(n,L-1-n)`}, ${M`e=\frac{r\,(L-1)}{2}`}</td><td>1/0.88, 1/0.75</td><td>1.10, 1.22</td></tr>
<tr><td>Kaiser (β = 2, 4, 8)</td><td>${M`\frac{I_0\left(\beta\sqrt{1-t^2}\right)}{I_0(\beta)}`} with ${M`t=\frac{n-(L-1)/2}{L/2}`}</td><td>1/0.785, 1/0.5975, 2.3097</td><td>1.5, 2.0, 2.5</td></tr>
<tr><td>Gaussian</td><td>${M`e^{-t^2/2}`} with ${M`t=\frac{n-(L-1)/2}{0.2\,(L-1)}`}</td><td>1/0.49</td><td>1.39</td></tr>
<tr><td>Exponential (damping)</td><td>${M`0.01^{\,n/(L-1)}`}</td><td>1</td><td>1</td></tr></table>
<p>${M`I_0`} is the modified Bessel function of the first kind, order 0. Without a window the rectangle is used.</p>
<h3>Zero-padding</h3>
<ul><li><b>Never</b> – ${M`N_{\mathrm{FFT}}=L`}, rounded up to an even number.</li>
<li><b>Optimal</b> – the smallest even ${M`N_{\mathrm{FFT}}\ge L`} whose only prime factors are 2, 3 and 5 (fast to transform).</li>
<li><b>Next power of 2</b>, and 2, 4 or 8 times it – ${M`N_{\mathrm{FFT}}=m\cdot2^{\lceil\log_2L\rceil}`} with ${M`m=1,2,4,8`}.</li></ul>
<p>Padding makes the line spacing ${M`\Delta f=f_s/N_{\mathrm{FFT}}`} finer; two frequencies closer than about ${M`f_s/L`} still cannot be told apart.</p>
<h3>Spectrum units</h3>
${EQ`L_k=20\log_{10}M_k\quad\text{(magnitude)},\qquad L_k=10\log_{10}P_k\quad\text{(power, PSD)}`}
<p><b>dBFS</b> subtracts the full-scale value ${M`A_{\mathrm{FS}}`}: ${M`L_k-20\log_{10}A_{\mathrm{FS}}`}. With "the maximum" as full scale, the highest line becomes 0 dBFS. The X unit CPM is ${M`60\,f`}.</p>
<h3>Smoothing</h3>
<p>Smoothing comes after the dB scale. It is a Hann-weighted moving average over an odd number ${M`S`} of lines, ${M`h=(S-1)/2`} on each side:</p>
${EQ`\tilde{Y}_k=\frac{\sum_{j=-h}^{h}v_j\,Y_{k+j}}{\sum_{j=-h}^{h}v_j},\qquad v_j=\sin^2\frac{\pi\,(j+h+1)}{S+1}`}
<p>Near the ends of the spectrum only the lines that exist are counted.</p>
<h3>Custom filter curves, A- and C-weighting</h3>
<p>A curve gives a gain ${M`g(f)`} at every frequency (a curve in dB, ${M`W(f)`}, gives ${M`g=10^{W/20}`}). The magnitude is multiplied by ${M`g(f_k)`}, the power and the PSD by ${M`g(f_k)^2`}. The A- and C-weighting curves of IEC 61672 are</p>
${EQ`R_A(f)=\frac{12194^2f^4}{\left(f^2+20.6^2\right)\sqrt{\left(f^2+107.7^2\right)\left(f^2+737.9^2\right)}\left(f^2+12194^2\right)},\qquad A(f)=20\log_{10}R_A(f)+2.00~\mathrm{dB}`}
${EQ`R_C(f)=\frac{12194^2f^2}{\left(f^2+20.6^2\right)\left(f^2+12194^2\right)},\qquad C(f)=20\log_{10}R_C(f)+0.06~\mathrm{dB}`}
<h3>Test for significant peaks (Siegel)</h3>
<p>On the ${M`m`} amplitudes ${M`a_k`} of the spectrum (the magnitude, or the square root of a power), a line passes when its share of the total exceeds Siegel's fraction ${M`\lambda=0.6`} of Fisher's critical value ${M`g_\alpha`}:</p>
${EQ`\frac{a_k}{\sum_ja_j}>\lambda\,g_\alpha,\qquad g_\alpha=1-\left(\frac{\alpha}{m}\right)^{1/(m-1)}`}
<p>${M`\alpha=0.05`} for 95 % and ${M`\alpha=0.01`} for 99 % confidence. The lines that do not pass are set to 0.</p>
${SEE('fft')}`),
      T('calculator', 'Signal Calculator', ['calculator', 'expression', 'formula', 'math', 'cross-spectrum', 'coherence', 'FRF', 'order analysis'], `
<p>${P('Signal tools', 'Signal calculator…')} creates a window from a formula over other windows. Windows are named <code>W1</code>, <code>W2</code>… (the number in their caption). For example:</p>
<ul><li><code>W1 * 2</code> – scale a signal</li>
<li><code>W1 - W2</code> – the difference of two signals</li>
<li><code>db(W3)</code> – a spectrum in decibels</li>
<li><code>coherence(W1, W2)</code> – how strongly two signals are related per frequency</li></ul>
<p>Functions include arithmetic and trigonometry (<code>abs</code>, <code>sqrt</code>, <code>log</code>, <code>exp</code>, <code>sin</code>…), <code>min</code>, <code>max</code>, <code>mean</code>, <code>rms</code>, <code>smooth</code>, <code>delay</code>, and two-signal analyses: <code>xcorr</code>, <code>conv</code>, <code>xspec</code> (cross-spectrum), <code>coherence</code>, <code>gain</code>, <code>frfmag</code>, <code>phase</code>, <code>align</code>. <code>cfft</code> and <code>ifft</code> transform to the complex spectrum and back (<code>re</code>, <code>im</code> take its parts), and <code>toorder</code> / <code>fromorder</code> resample to and from shaft orders for order analysis.</p>
<p>The result stays linked to every window in the formula.</p>
<h2>How the spectral functions are calculated</h2>
<p><code>xspec</code>, <code>coherence</code>, <code>gain</code>, <code>frfmag</code> and <code>phase</code> use Welch's method. Both signals are cut into segments of ${M`L`} samples (the optional third argument, 1024 by default) with 50 % overlap; each segment loses its mean, gets a Hann window and is transformed with ${M`N=2^{\lceil\log_2L\rceil}`} points, giving ${M`A_k^{(j)}`} and ${M`B_k^{(j)}`} for the segments ${M`j=1\ldots J`}. With the sums (* is the complex conjugate)</p>
${EQ`S_{ab}(k)=\sum_{j=1}^{J}A_k^{(j)*}B_k^{(j)},\qquad S_{aa}(k)=\sum_j\left|A_k^{(j)}\right|^2,\qquad S_{bb}(k)=\sum_j\left|B_k^{(j)}\right|^2`}
<table class="hv-table hv-mtable"><tr><th>Function</th><th>Formula</th></tr>
<tr><td><code>xspec(a, b)</code></td><td>${M`\frac{2\left|S_{ab}\right|}{J\left(\sum_nw_n\right)^2}`}</td></tr>
<tr><td><code>coherence(a, b)</code></td><td>${M`\gamma^2=\frac{\left|S_{ab}\right|^2}{S_{aa}S_{bb}}`}, from 0 (unrelated) to 1</td></tr>
<tr><td><code>gain(a, b)</code></td><td>${M`\left|H_1\right|=\frac{\left|S_{ab}\right|}{S_{aa}}`} – the frequency response from a to b</td></tr>
<tr><td><code>frfmag(a, b)</code></td><td>${M`20\log_{10}\left|H_1\right|`}</td></tr>
<tr><td><code>phase(a, b)</code></td><td>${M`\frac{180}{\pi}\arg S_{ab}`} in degrees</td></tr>
<tr><td><code>xcorr(a, b)</code></td><td>${M`r_{ab}(\ell)=\frac{\sum_n\left(a_{n+\ell}-\bar{a}\right)\left(b_n-\bar{b}\right)}{\sqrt{\sum_n\left(a_n-\bar{a}\right)^2\sum_n\left(b_n-\bar{b}\right)^2}}`} for ${M`\ell=-(N-1)\ldots N-1`}</td></tr>
<tr><td><code>conv(a, b)</code></td><td>${M`(a*b)_n=\sum_ma_m\,b_{n-m}`}</td></tr>
<tr><td><code>cfft(a)</code></td><td>${M`X_k=\sum_{n=0}^{N-1}a_n\,e^{-i2\pi kn/N}`}, shown as ${M`\frac{2}{N}\left|X_k\right|`}; <code>re</code> and <code>im</code> give ${M`\frac{2}{N}\operatorname{Re}X_k`} and ${M`\frac{2}{N}\operatorname{Im}X_k`}</td></tr>
<tr><td><code>ifft(c)</code></td><td>${M`x_n=\frac{1}{N}\sum_{k=0}^{N-1}X_k\,e^{i2\pi kn/N}`}</td></tr>
<tr><td><code>toorder(a, rpm, R)</code></td><td>${M`a`} at the shaft angles ${M`\theta=m/R`} revolutions (R samples per revolution, 32 by default), where ${M`\theta(t)=\int_0^t\frac{\mathrm{rpm}(t')}{60}\,dt'`}; an FFT of the result has shaft orders on its X axis</td></tr></table>`),
      T('editnode', 'Edit node (table)', ['edit node', 'table', 'spreadsheet', 'excel', 'edit values', 'change values', 'formula', 'paste values'], `
<p>An <b>Edit node</b> lets you change single values of a window without touching it: it is a window of its own, linked to the window it was made from, whose result is the parent's values with your changes. Every window you create from the Edit node – an FFT, a filter, an instrument – uses the edited values.</p>
<p>Make one with ${P('Signal tools', 'Edit node (table)…')}, ${P('Edit', 'Edit node (table)…')} or "Add edit node (table)" in the window menu. Its window is a simple spreadsheet:</p>
<ul><li><b>Name box and formula bar</b> at the top: the selected cell (type <code>Y100</code> or <code>100</code> into the name box to go there) and its value.</li>
<li><b>Row numbers</b>, the <b>X</b> column (time or frequency, follows the sample rate) and the <b>Y</b> column with the values you can change.</li>
<li>Changed cells are <b>yellow</b> with a mark in the corner; the tooltip shows the original value. The status bar counts the changes and shows the average, count and sum of a selection.</li></ul>
<h2>Changing values</h2>
<ul><li>Select a Y cell and type a number, then ${K('Enter')} (down), ${K('Tab')} or an arrow key. ${K('F2')} or a double-click edits the current value; ${K('Esc')} cancels.</li>
<li>Type a <b>formula</b> starting with <code>=</code>: <code>x</code> is the X value, <code>y</code> the original value, <code>i</code> the row number, with + − * / ^, <code>pi</code> and functions such as <code>sqrt</code>, <code>sin</code>, <code>abs</code>, <code>min</code>, <code>max</code>, <code>round</code>. Example: <code>=y*2</code>.</li>
<li>Select several cells (drag, ${K('Shift')}+click or ${K('Shift')}+arrows) and finish with ${K('Ctrl', 'Enter')} to fill all of them – a formula is worked out for each row.</li>
<li>${K('Delete')} or <b>Restore</b> brings back the original values of the selection; <b>Restore all</b> undoes every change. ${K('Ctrl', 'Z')} / ${K('Ctrl', 'Y')} undo and redo.</li>
<li>${K('Ctrl', 'C')} copies the selection (tab-separated, for a spreadsheet); ${K('Ctrl', 'V')} pastes a column of numbers into Y from the selected row down – a single number fills the whole selection.</li>
<li>Click a column header to select the column, a row number to select the row, the corner to select everything.</li></ul>
<p><b>Graph</b> shows the edited values as an ordinary signal graph; the window menu item <span class="hv-path">Show as table</span> switches back. The changes are saved with the workspace. When the parent changes (zoom, new data), the Edit node recalculates and keeps your changes at the same rows.</p>
${SEE('linked', 'calculator', 'control')}`),
      T('autocorr', 'Autocorrelation', ['autocorrelation', 'periodicity', 'correlation'], `
<p>${P('Signal tools', 'Autocorrelation')} shows how similar the visible part is to shifted copies of itself. Peaks at a lag reveal a repeating pattern with that period, even when it is hidden in noise.</p>
<p>For the correlation of two different signals use <code>xcorr(W1, W2)</code> in the ${L('calculator')}.</p>
<h2>How it is calculated</h2>
${EQ`\rho_m=\frac{\sum_{n=0}^{N-1-m}\left(x_n-\bar{x}\right)\left(x_{n+m}-\bar{x}\right)}{\sum_{n=0}^{N-1}\left(x_n-\bar{x}\right)^2},\qquad m=0\ldots N-1`}
<p>It is drawn against the lag ${M`\tau=m/f_s`}, and ${M`\rho_0=1`}. OpenSig calculates the sums with the FFT (Wiener–Khinchin theorem): the inverse transform of ${M`\left|X_k\right|^2`}, zero-padded to at least ${M`2N`} points so that the end of the signal does not wrap around to its start.</p>`),
      T('fftfilter', 'FFT Filter', ['filter', 'low-pass', 'high-pass', 'band-pass', 'band-stop', 'FFT filter', 'filter curve'], `
<p>${P('Signal tools', 'FFT filter…')} (${K('Ctrl', 'Y')}) removes frequencies by working on the spectrum: the signal is transformed, the unwanted frequencies are suppressed and the result is transformed back. Choose low-pass, high-pass, band-pass or band-stop with the cut-off frequencies, or a custom filter curve.</p>
<p>The <b>filter slope width</b> makes the transition gradual; 0 gives a brick-wall filter. FFT filters have no phase shift.</p>
<p>${P('File', 'Save as filter curve…')} turns a spectrum into a curve you can apply, and ${P('File', 'Import filter curve (.flt) / filter bank (.flb)…')} reads existing curves.</p>
<h2>How it is calculated</h2>
<p>The mean is removed, the signal is zero-padded to ${M`N=2^{\lceil\log_2 2n\rceil}`} points and transformed. Every line is multiplied by the filter's gain ${M`H(f_k)`}, the result is transformed back, and the mean is put back for low-pass (and band-stop) filters. With the slope width ${M`\Delta`}, an edge at ${M`f_c`} rises as a raised cosine:</p>
${EQ`c(f;f_c)=\begin{cases}0 & f\le f_c-\Delta/2\\ \frac{1}{2}-\frac{1}{2}\cos\frac{\pi\left(f-f_c+\Delta/2\right)}{\Delta} & \left|f-f_c\right|<\Delta/2\\ 1 & f\ge f_c+\Delta/2\end{cases}`}
${EQ`H_{\mathrm{LP}}=1-c(f;f_1),\quad H_{\mathrm{HP}}=c(f;f_1),\quad H_{\mathrm{BP}}=\min\left(c(f;f_1),\,1-c(f;f_2)\right),\quad H_{\mathrm{BS}}=1-H_{\mathrm{BP}}`}
<p>"Reduce stop-band amplitude by D dB" sets a floor: ${M`H'=s+(1-s)\,H`} with ${M`s=10^{-D/20}`}. With ${M`\Delta=0`} the edges are steps. The gain is real and the same for positive and negative frequencies, so the filter shifts no phase.</p>
${SEE('iirfilter')}`),
      T('iirfilter', 'IIR Filter', ['IIR', 'Butterworth', 'filter order', 'recursive filter'], `
<p>${P('Signal tools', 'IIR filter…')} applies a Butterworth filter – low-pass, high-pass, band-pass or band-stop – of order 2 to 12. Higher orders cut more steeply. Unlike the ${L('fftfilter')}, an IIR filter works sample by sample like an analogue filter and shifts the phase.</p>`),
      T('averager', 'Signal Averager', ['average', 'averager', 'synchronous average', 'noise reduction'], `
<p>${P('Signal tools', 'Averager…')} averages the successive results of its parent – for example spectra while a signal plays, or repeated measurements during acquisition. Random noise averages out while repeating components stay.</p>
<p>To average several existing windows, select them in the ${L('control')} and choose Average.</p>`),
      T('resample', 'Resampling signals', ['resample', 'sampling rate', 'downsample', 'upsample'], `
<p>${P('Signal tools', 'Resample…')} converts the signal to another sampling rate with proper filtering, for example to bring two recordings to the same rate. To relabel the rate without changing any samples, use ${P('Edit', 'Sample rate change (w/o resampling)…')}.</p>`),
      T('conditioning', 'Removing DC, trends and peaks', ['DC offset', 'mean', 'trend', 'detrend', 'peaks', 'spikes', 'outliers', 'smoothing', 'moving average'], `
<ul><li>${P('Signal tools', 'Remove DC offset')} subtracts the mean so the signal is centred on zero.</li>
<li>${P('Signal tools', 'Remove linear trend')} subtracts the best-fitting straight line, removing slow drift.</li>
<li>${P('Signal tools', 'Remove peaks…')} replaces spikes beyond a limit.</li>
<li>${P('Signal tools', 'Moving average smoothing…')} averages each point with its neighbours to reduce noise.</li>
<li>${P('Signal tools', 'Scale / normalize…')} multiplies, offsets or normalises the values, for example to a peak of 1.</li></ul>`),
      T('hold', 'Peak and Min Hold', ['peak hold', 'min hold', 'maximum', 'envelope'], `
<p>${P('Signal tools', 'Peak hold')} keeps, for every point, the highest value its parent has shown so far; ${P('Signal tools', 'Min hold')} the lowest. On a spectrum while a signal plays, peak hold shows the strongest level each frequency ever reached.</p>`),
      T('histogram', 'Probability distribution', ['histogram', 'distribution', 'probability'], `
<p>${P('Signal tools', 'Probability distribution / Histogram…')} counts how often values fall into each of a number of bins – showing whether a signal is, for example, normally distributed, clipped or bimodal.</p>`),
      T('integral', 'Integral, derivative and sorted values', ['integral', 'integrate', 'derivative', 'differentiate', 'sorted values', 'velocity', 'acceleration'], `
<ul><li>${P('Signal tools', 'Integral curve')} – the running integral, for example velocity from acceleration.</li>
<li>${P('Signal tools', 'Differentiate')} – the rate of change.</li>
<li>${P('Signal tools', 'Sorted values curve')} – all values sorted in ascending order, showing how much of the time a level is exceeded.</li></ul>`),
      T('envelope', 'Envelope and instantaneous frequency', ['envelope', 'Hilbert', 'instantaneous frequency', 'demodulation', 'local max'], `
<ul><li>${P('Signal tools', 'Envelope (Hilbert transform)')} – the amplitude envelope of a modulated signal, widely used for bearing diagnostics.</li>
<li>${P('Signal tools', 'Envelope (local max method)')} – an envelope through the local maxima.</li>
<li>${P('Signal tools', 'Instantaneous frequency (Hilbert transform)')} – the frequency at every moment, for sweeps and frequency-modulated signals.</li></ul>
<p>An FFT of the envelope shows the modulation frequencies.</p>
<h2>How it is calculated</h2>
<p>Both use the analytic signal ${M`z_n`}: the FFT of the whole signal with the negative frequencies removed and the positive ones doubled, transformed back:</p>
${EQ`z_n=\frac{1}{N}\sum_{k=0}^{N-1}H_kX_k\,e^{i2\pi kn/N},\qquad H_k=\begin{cases}1 & k=0,\ k=N/2\\ 2 & 0<k<N/2\\ 0 & k>N/2\end{cases}`}
${EQ`e_n=\left|z_n\right|,\qquad f_n=\frac{f_s}{2\pi}\operatorname{wrap}\left(\arg z_n-\arg z_{n-1}\right)`}
<p>${M`e_n`} is the envelope and ${M`f_n`} the instantaneous frequency; wrap brings the phase step into ${M`(-\pi,\pi]`}. The real part of ${M`z_n`} is the signal itself, the imaginary part its Hilbert transform.</p>`),
      T('zerocross', 'Zero-crossings and cepstrum', ['zero crossing', 'cepstrum', 'quefrency', 'echo'], `
<p>${P('Signal tools', 'Zero-crossings')} marks where the signal crosses zero; see also the zero-crossing rate instrument.</p>
<p>${P('Signal tools', 'Cepstrum')} is the spectrum of the logarithmic spectrum. Peaks reveal families of evenly spaced harmonics or sidebands, and echoes.</p>
<h2>How the cepstrum is calculated</h2>
${EQ`c_n=\frac{1}{N}\sum_{k=0}^{N-1}\ln\left|X_k\right|e^{i2\pi kn/N},\qquad n=0\ldots N/2-1`}
<p>${M`X_k`} is the FFT of the visible part after removing the mean and applying a Hann window. The X axis is the quefrency ${M`\tau=n/f_s`}: harmonics at ${M`f_0,2f_0,3f_0\ldots`} give a peak at ${M`\tau=1/f_0`}, an echo after ${M`T`} seconds a peak at ${M`\tau=T`}.</p>`),
      T('wavelet', 'Wavelet denoising', ['wavelet', 'denoise', 'Haar', 'Daubechies'], `
<p>${P('Signal tools', 'Wavelet denoising…')} splits the signal into wavelet levels (Haar or Daubechies 2/4/6), shrinks the small coefficients that mostly contain noise, and rebuilds the signal. Choose the number of levels, the threshold rule (universal, robust per level, or a fixed 3σ) and soft or hard shrinkage.</p>
${SEE('cwt')}`),
      T('tacho', 'Tacho signal to RPM', ['tacho', 'RPM', 'speed', 'pulses', 'rotation'], `
<p>${P('Signal tools', 'Convert tacho signal to RPM…')} turns a pulse signal from a speed sensor into rotational speed over time. Enter the pulses per revolution and choose RPM or Hz.</p>`),
      T('align', 'Aligning signals', ['align', 'sync', 'delay', 'time shift'], `
<p>${P('Signal tools', 'Align signals (sync)…')} finds the time shift between signals by cross-correlation and shifts them into line, for example two recordings of the same event made by different devices.</p>
<p>The delay of each signal ${M`b`} against the first signal ${M`a`} is the shift with the highest cross-correlation (see ${L('calculator')}): ${M`D=\arg\max_d\sum_n\left(a_n-\bar{a}\right)\left(b_{n+d}-\bar{b}\right)`} samples, or ${M`D/f_s`} seconds.</p>`),
      T('octave', 'Octave plots', ['octave', '1/3 octave', 'third octave', 'fractional octave', 'filter bank', 'acoustics'], `
<p>${P('Signal tools', 'Octave plot')} and ${P('Signal tools', '1/3 octave plot')} show the level in standard frequency bands, as used in acoustics and noise measurement. ${P('Signal tools', 'Other octave plots')} adds 1/6, 1/9 and 1/12 octaves and a dialog with A- or C-weighting.</p>
<p>${P('Signal tools', 'Custom filter bank plot…')} uses bands you define, one "from;to" line per band in Hz.</p>
<h2>How it is calculated</h2>
<p>For 1/b octaves (b = 1, 3, 6, 9 or 12) the bands are the base-10 bands of IEC 61260, with ${M`G=10^{3/10}`}. Band ${M`i`} has the mid-band frequency and band edges</p>
${EQ`f_m=\begin{cases}1000\cdot G^{\,i/b} & b\ \text{odd}\\ 1000\cdot G^{\,(2i+1)/(2b)} & b\ \text{even}\end{cases},\qquad f_{1,2}=f_m\,G^{\mp1/(2b)}`}
<p>The level of a band sums the powers of the FFT lines inside it. The spectrum is a Hann-windowed FFT of the whole visible part, each line's power corrected for the window's noise bandwidth so that the sum is the mean square in the band:</p>
${EQ`L_m=10\log_{10}\sum_{f_1\le f_k\le f_2}\tilde{P}_k\,10^{W(f_k)/10},\qquad\tilde{P}_k=\frac{2\left|X_k\right|^2}{N\sum_nw_n^2}`}
<p>${M`W(f)`} is the A- or C-weighting in dB (see ${L('fftparams')}), or 0. Bands narrower than the line spacing are left out. A custom filter bank plot sums the lines between the edges you give, and draws each band at ${M`\sqrt{f_1f_2}`}.</p>`),
      T('overtime', 'Instrument values over time', ['over time', 'trend', 'history', 'band level'], `
<p>${P('Signal tools', 'Instrument values over time…')} runs an instrument at successive positions of a signal and draws the results as a new signal – for example the RMS level or the dominant frequency over the whole recording.</p>`),
      T('srs', 'Shock Response Spectrum', ['SRS', 'shock', 'shock response'], `
<p>${P('Signal tools', 'Shock Response Spectrum (SRS)…')} shows the peak response of a series of single-degree-of-freedom systems to a shock, against their natural frequency. It is used to judge how damaging a mechanical shock is.</p>
<h2>How it is calculated</h2>
<p>For each natural frequency ${M`f_j=f_{\min}\,2^{j/p}`} (p points per octave, up to ${M`f_{\max}`} and ${M`f_s/2`}), the signal drives a single-degree-of-freedom system with the damping ratio ${M`\zeta=\frac{1}{2Q}`}. Its absolute acceleration response is simulated with Smallwood's ramp-invariant recursive filter (${M`\Delta t=1/f_s`}):</p>
${EQ`y_n=b_0x_n+b_1x_{n-1}+b_2x_{n-2}+a_1y_{n-1}+a_2y_{n-2}`}
${EQ`\omega=2\pi f_j,\quad\omega_d=\omega\sqrt{1-\zeta^2},\quad E=e^{-\zeta\omega\Delta t},\quad K=\omega_d\Delta t,\quad C=E\cos K,\quad S=\frac{E\sin K}{K}`}
${EQ`b_0=1-S,\quad b_1=2\,(S-C),\quad b_2=E^2-S,\quad a_1=2C,\quad a_2=-E^2`}
<p>The spectrum shows ${M`\max_ny_n`} (peak positive), ${M`\max_n(-y_n)`} (peak negative) or the larger of the two, in the unit of the input.</p>`),
      T('peaks', 'Peak detection', ['peak detection', 'peaks', 'threshold', 'peak count', 'prominence', 'valleys', 'find peaks', 'z-score', 'wavelet peaks', 'copy peaks'], `
<p>${P('Signal tools', 'Peak detection…')} (also in the window menu) marks every peak in the visible part with its position and value. It is a setting of the signal window rather than a new window, so the markers follow when you zoom or play. Choose one of six <b>methods</b>:</p>
<table class="hv-table"><tr><th>Method</th><th>Finds</th><th>Good for</th></tr>
<tr><td>Threshold</td><td>The maximum of each part above a threshold</td><td>Clean signals</td></tr>
<tr><td>Prominence</td><td>Local maxima that rise at least a given amount above the valleys beside them</td><td>Peaks on a sloping or wandering baseline</td></tr>
<tr><td>N highest peaks</td><td>The highest local maxima</td><td>The strongest lines of a spectrum</td></tr>
<tr><td>Slope (smoothed derivative)</td><td>Where the smoothed slope turns from rising to falling</td><td>Broad peaks with noise on them</td></tr>
<tr><td>Adaptive threshold (moving z-score)</td><td>Samples outside a moving band of mean ± N standard deviations</td><td>Live and drifting signals, sudden events</td></tr>
<tr><td>Wavelet ridge lines (CWT)</td><td>Peaks that stay visible across a range of wavelet scales</td><td>Noisy data with peaks of a known width</td></tr></table>
<h2>Threshold</h2>
<ul><li><b>Positive threshold</b> – a peak is the first maximum of each part above it. The default is the minimum plus 75 % of the range.</li>
<li><b>Negative threshold</b> – a level (not a magnitude) for valleys; the default is the minimum plus 25 %.</li>
<li><b>Minimal width</b> – parts shorter than this many samples are skipped.</li>
<li><b>Allow multiple peaks inside one threshold crossing</b> – every local maximum that is also the largest within half the width.</li></ul>
<h2>Prominence</h2>
<p>The <b>prominence</b> of a peak is how far it rises above the higher of the two lowest points between it and the next higher sample on each side. A small bump on the flank of a big peak has a small prominence even when it is high. Optionally require a <b>minimum height</b> and a <b>minimum width</b>, measured halfway down the prominence. Results match <code>scipy.signal.find_peaks</code>.</p>
<h2>N highest peaks</h2>
<p>The given number of highest local maxima. Both this method and Prominence take a <b>minimum distance</b>: of two peaks closer than that many samples, only the higher one is kept.</p>
<h2>Slope</h2>
<p>The first derivative is smoothed over the <b>smoothing width</b>; a peak is where it crosses zero going down, more sharply than the <b>slope threshold</b>, at the highest sample nearby that is above the <b>minimum height</b>. Wider smoothing ignores more noise but merges close peaks.</p>
<h2>Adaptive threshold</h2>
<p>A moving band follows the mean and standard deviation of the last <b>window</b> samples. A sample further than <b>threshold</b> standard deviations from the mean signals a peak (or a valley); the extreme of each run of signalling samples is marked. <b>Influence</b> sets how much signalling samples move the band – 0 keeps it on the baseline.</p>
<h2>Wavelet ridge lines</h2>
<p>The signal is analysed with Ricker ("Mexican hat") wavelets of every width in the given range. A peak shows as a line of maxima across the widths; lines that are long enough and stand out from the local noise by the <b>minimum signal-to-noise ratio</b> are kept. Results match <code>scipy.signal.find_peaks_cwt</code>. This method is slower on very long visible parts.</p>
<h2>All methods</h2>
<ul><li><b>Detect negative peaks (valleys)</b> – also marks the minima.</li>
<li><b>Peak position</b> – at the sample, or between samples by fitting a parabola (or a Gaussian, exact for Gaussian-shaped peaks) through the top three samples. Use it for exact frequencies of spectral lines.</li></ul>
<p>${P('Signal tools', 'Copy detected peaks')} copies the X and Y of every marked peak, tab-separated, for a spreadsheet. The Peak count and Average peak distance ${L('instruments')} read the detected peaks.</p>`)
    ]),

    B('three', '3D Analysis', '<p>Tools that show how a spectrum changes over time.</p>', [
      T('spectrogram', 'Spectrogram', ['spectrogram', 'time-frequency', 'waterfall', 'Ctrl+G'], `
<p>${P('3D tools', 'Spectrogram…')} (${K('Ctrl', 'G')}) cuts the visible part into overlapping segments, calculates the spectrum of each and shows them side by side: time on the X axis, frequency on the Y axis and level as colour. ${P('3D tools', 'Spectrogram with default settings')} skips the dialog.</p>
<h2>How it is calculated</h2>
<p>The visible part is cut into segments of ${M`L`} samples that overlap by the fraction ${M`o`}: segment ${M`j`} starts at ${M`jh`}, with ${M`h=\operatorname{round}\left(L\,(1-o)\right)`}. Each segment loses its mean, is multiplied by the window and transformed with ${M`N=p\cdot2^{\lceil\log_2L\rceil}`} points, where ${M`p=1,2,4,8`} is the zero padding (finer frequency lines, the same amplitudes):</p>
${EQ`X_k^{(j)}=\sum_{n=0}^{L-1}w_n\left(x_{jh+n}-\bar{x}^{(j)}\right)e^{-i2\pi kn/N}`}
${EQ`Z_{jk}=20\log_{10}\frac{c_k\left|X_k^{(j)}\right|}{\sum_nw_n},\qquad c_k=\begin{cases}1 & k=0,\ k=N/2\\ 2 & \text{otherwise}\end{cases}`}
<p>${M`Z_{jk}`} is drawn at the centre of the segment, ${M`t_j=\left(jh+L/2\right)/f_s`}, and at the frequency ${M`f_k=kf_s/N`}. Dividing by ${M`\sum_nw_n`} makes a sine of amplitude ${M`A`} show as ${M`20\log_{10}A`} dB. Long signals are thinned to at most 2000 evenly spaced segments. <b>Average consecutive spectra</b> replaces each segment by the mean power of the ${M`A`} segments around it,</p>
${EQ`\bar{Z}_{jk}=10\log_{10}\frac{1}{A}\sum_{q}10^{Z_{qk}/10},\qquad q=j-\lfloor(A-1)/2\rfloor\ldots j+\lceil(A-1)/2\rceil`}
<p>(fewer at the ends): the noise scatters less, and the time detail is coarser.</p>
${SEE('timefft', 'views3d', 'cursor3d')}`),
      T('timefft', 'Time FFT', ['time FFT', 'mesh', 'waterfall', '3D', 'Ctrl+T'], `
<p>${P('3D tools', 'Time FFT…')} (${K('Ctrl', 'T')}) calculates the same series of spectra as the ${L('spectrogram')} and shows them as a <b>mesh</b>: a shaded surface in a 3D box, with the frequency along the front left edge, the time along the front right edge and the level upwards and in the palette's colours (Hot for a new time FFT). ${P('3D tools', 'Time FFT statistics…')} reduces it to the average, minimum or maximum spectrum.</p>
<h2>The settings</h2>
<ul><li><b>FFT segment length</b>, <b>overlap</b> and <b>window</b> – as for the ${L('spectrogram')}: longer segments give finer frequency, shorter ones finer time resolution.</li>
<li><b>Zero padding</b> (2, 4 or 8 ×) – finer frequency lines, so narrow peaks are drawn round instead of as single spikes; the amplitudes stay the same.</li>
<li><b>Average consecutive spectra</b> – the mean power of this many neighbouring segments: a calmer surface, with less time detail.</li>
<li><b>Frequencies from / to</b> – the band shown (0 as the highest: up to half the sample rate). Drag a rectangle in the spectrogram view to zoom further; double-click there returns to this band.</li>
<li><b>Level</b> – linear amplitude (peaks stand out) or dB (weak components show too); ${P('3D tools', 'Mesh level in dB')} switches it later.</li></ul>
<h2>Turning and reading the mesh</h2>
<p>Drag in the mesh to turn it (left and right) and tilt it (up and down); the back walls and the labelled edges follow. The mouse wheel zooms, a double-click returns to the first view. The point under the pointer is marked – a dashed line down to the floor – with its time, frequency and level beside it and in the status bar.</p>
<h2>How it is calculated</h2>
<p>The mesh is the matrix ${M`Z_{jk}`} of the ${L('spectrogram')}. Time FFT statistics reduces the ${M`J`} segments inside a time range to one spectrum: the energy average, the maximum, the minimum or the standard deviation over ${M`j`}:</p>
${EQ`\bar{Z}_k=10\log_{10}\frac{1}{J}\sum_j10^{Z_{jk}/10},\qquad\max_jZ_{jk},\qquad\min_jZ_{jk}`}
<p><b>Sum 3D over frequency range</b> gives the level of a band in every segment, ${M`10\log_{10}\sum_{k=k_1}^{k_2}10^{Z_{jk}/10}`}.</p>`),
      T('cwt', 'Continuous wavelet transform', ['CWT', 'wavelet', 'Morlet', 'scalogram'], `
<p>${P('3D tools', 'Continuous wavelet transform (CWT)…')} shows a time-frequency picture using Morlet wavelets. Unlike a spectrogram, its time resolution is finer at high frequencies and its frequency resolution finer at low ones – good for short events in slower signals.</p>
<h2>How it is calculated</h2>
<p>OpenSig uses the analytic Morlet wavelet in the frequency domain. The visible part loses its mean, is zero-padded to ${M`N`} points (a power of 2) and transformed once. Then, for each frequency ${M`f`} of the grid,</p>
${EQ`W_n(f)=\frac{1}{N}\sum_{k=1}^{N/2-1}X_k\,\hat{\psi}_f(\omega_k)\,e^{i2\pi kn/N},\qquad\hat{\psi}_f(\omega)=2\,e^{-\left(s\omega-\omega_0\right)^2/2},\quad s=\frac{\omega_0}{2\pi f},\quad\omega_k=\frac{2\pi kf_s}{N}`}
<p>is shown in dB, ${M`20\log_{10}\left|W_n(f)\right|`}. In time, the wavelet is a wave of frequency ${M`f`} under a Gaussian envelope with the standard deviation ${M`s`} seconds, so high frequencies get short wavelets. A larger ${M`\omega_0`} (6 by default) gives a finer frequency and a coarser time resolution.</p>`),
      T('views3d', '3D views and palettes', ['mesh view', 'spectrogram view', 'palette', 'colour map', 'Z axis', 'F2', 'F3'], `
<p>Every 3D window can be shown as a <b>spectrogram</b> (${K('F3')}) or a <b>mesh</b> (${K('F2')}). The mesh is a smoothly shaded surface on black, seen at first from the corner of the highest frequency and the first time (drag to turn and tilt it, the wheel to zoom, double-click for the first view; the point under the pointer shows its values): two grey back walls, the frequency and time scales on the front edges (with their exact end values), the level on the right corner and the colour map on the left. It shows the linear amplitude, so the strongest components stand out as peaks; ${P('3D tools', 'Mesh level in dB')} shows it in dB. ${P('3D tools', 'Palette')} chooses one of 13 colour palettes, ${P('3D tools', 'Adjust Z-axis…')} sets the level range, ${P('3D tools', 'Show colour map')} adds the colour scale and ${P('3D tools', 'Invert colours')} reverses it. "Optimize colours for low amplitudes" brings out weak components.</p>`),
      T('cursor3d', '3D cursor and cross sections', ['3D cursor', 'cross section', 'cross-section', 'ruler', 'slice', 'extract', 'Tab', 'arrow keys'], `
<p>${K('Tab')} switches the <b>3D cursor</b> on and off, in the spectrogram and the mesh view. It sits on one spectrum (a time) and one frequency line: click to put it – in the mesh, on the surface, where it takes the peak under the pointer – and move it with the arrow keys, ${K('←')} / ${K('→')} one spectrum along the time and ${K('↑')} / ${K('↓')} one line along the frequency (ten with ${K('Shift')}). The status bar shows its time, frequency and level.</p>
<p>The cursor shows its two <b>cross sections</b>: the spectrum at its time (cyan) and the level of its frequency over time (green). In the mesh they run over the surface, hidden where nearer peaks stand in front, with their positions marked on the frequency and time scales; in the spectrogram view they are the two cursor lines.</p>
<h2>Cross-section windows</h2>
<ul><li>${P('3D tools', 'Cross sections at the cursor')} opens both as windows, side by side under the 3D window.</li>
<li>${P('3D tools', 'Cross section at cursor time (spectrum)')} and ${P('3D tools', 'Cross section at cursor frequency (level over time)')} open one of them.</li></ul>
<p>These windows <b>follow the cursor</b>: move it and they show the new spectrum or frequency, with the position in their title. With the cursor switched off they keep the last one. They show linear amplitudes when the mesh does, dB otherwise, and can be analysed like any signal – an FFT of the level over time, instruments, peak detection. ${P('3D tools', 'Extract slice from max X position')} and ${P('3D tools', 'Extract slice from max Y position')} open a cross section through the highest point that stays there.</p>
<p>${P('3D tools', 'Track changes in 3D graphics…')} follows the maximum through the graph, and ${P('3D tools', '3D signal filter…')} keeps only a frequency and time region.</p>`)
    ]),

    B('modal', 'Geometry and Mode Shapes', '<p>A 3D model of the test object that moves with your measurements: operating deflection shapes, mode shapes, natural frequencies and damping from ambient vibration tests (operational modal analysis).</p>', [
      T('geometry', 'The Geometry node', ['geometry', 'Geometry node', 'modal analysis', 'OMA', 'operational modal analysis', 'ambient vibration', 'structure', 'bridge', 'bridge deck', 'example'], `
<p>A <b>Geometry node</b> draws a 3D model of the test object and moves it with your measurements, so you can see how the structure vibrates.</p>
<p>Make one in any of three ways:</p>
<ul><li>${P('3D tools', 'Geometry and mode shapes (ODS / FDD)…')};</li>
<li>the large Geometry button at the right end of the toolbar (after Help, as tall as both rows);</li>
<li>select the measured signals in the ${L('control')} and choose "Geometry with the selected signals" from the empty-space menu – the signals are put in the DOFs tab, ready to get their nodes.</li></ul>
<p>A new Geometry window nearly fills the work area. On the left is the model view, with the animation controls and the tool box above it; on the right is the editor with six tabs: <b>Nodes</b>, <b>Lines</b>, <b>Surfaces</b>, <b>DOFs</b>, <b>FDD</b> and <b>Modes</b>. The model, the channels, the view and the mode table are saved with the workspace.</p>
<h2>Step by step</h2>
<ol><li>Build the model – ${L('geomodel')} and ${L('geodraw')} – or open a saved one (${L('geofile')}).</li>
<li>Tell OpenSig where each sensor was: ${L('geodofs')}.</li>
<li>Look at the motion: ${L('geoanim')}.</li>
<li>Find the natural frequencies and the damping: ${L('geomodes')}.</li>
<li>Press <b>▶ Run</b> for the finished model: ${L('georun')}.</li></ol>
<p>With fewer sensors than measurement points, measure in several setups and let OpenSig combine them: ${L('georoving')}.</p>
<h2>Examples: a bridge deck</h2>
<p>${P('Help', 'Examples', 'Bridge deck: ambient vibration and mode shapes')} sets up a typical ambient vibration test of a 30 m single-span deck, 8 m wide, on two abutments. Ten vertical accelerometers sit on both edges at 5, 10, 15, 20 and 25 m; the two at 10 m are the reference channels. The five-minute records (100 samples/s) are simulated: traffic and wind excite four modes – vertical bending at 3.2 Hz, torsion at 4.7 Hz, second bending at 12.1 Hz and second torsion at 15.3 Hz. The Geometry node opens on the FDD tab with the first mode animated; press <b>▶ Run</b> to see the finished model with its four mode buttons, or click the peaks to compare the shapes. In bending both edges move together; in torsion they move in opposite directions.</p>
<p>${P('Help', 'Examples', 'Bridge deck: roving test in 2 setups')} measures the same deck with only six sensors: the two at 10 m stay in place as references, the other four move from 5 and 15 m (setup 1) to 20 and 25 m (setup 2). The Geometry node combines the two setups into full mode shapes.</p>
${NOTE('The channels need one common sample rate. Measure all channels of a setup at the same time – the shapes come from their cross-spectra.')}
${SEE('geomodel', 'geodofs', 'geoanim', 'geomodes', 'georun')}`),
      T('geomodel', 'Nodes, lines and surfaces', ['nodes', 'lines', 'surfaces', 'coordinates', 'generate', 'grid', 'box', 'circle', 'cylinder', 'cone', 'beam', 'outline', 'paste nodes', 'rename node', 'node name', 'renumber', 'F2'], `
<p>The model is a set of <b>nodes</b> – points with X, Y and Z coordinates – joined by <b>lines</b> and <b>surfaces</b>.</p>
<ul><li><b>Nodes</b> – type them in the <b>Nodes</b> tab (<b>+ Node</b>), paste "number, X, Y, Z" lines (optionally with a name) from a spreadsheet with <b>Paste…</b>, or use <b>Generate</b>: grid, rectangle outline, box, circle, cylinder, truncated cone or beam, each placed at an origin (X, Y, Z) of your choice. The cylinder, cone and circle generators also set the cylinder axis for radial and tangential sensors (${L('geodofs')}).</li>
<li><b>Lines</b> and <b>Surfaces</b> (three or four corner nodes) connect them. Add them in their tabs and choose the nodes from the lists, or draw them with the mouse (${L('geodraw')}).</li>
<li>× deletes a row; deleting a node also deletes its lines and surfaces. <b>Clear</b> removes the whole model but keeps the channel list.</li></ul>
<h2>Renaming a node</h2>
<p>Give a node another number, a name (for example "Midspan north"), or both: select the node and click <b>Rename…</b>, double-click the node in the view, right-click it and choose "Rename node…", or press ${K('F2')}. You can also type in the node's Node and Name cells in the table. Lines, surfaces and channels follow a new number; the name appears next to the number in the view and in the DOFs table, and is saved in .osgeo files.</p>
<h2>Renumbering</h2>
<p><b>Renumber…</b> gives all nodes new numbers from a first number with an increment, in their current order or sorted by X, Y or Z. Lines, surfaces, channels and names follow.</p>
${SEE('geodraw', 'geofile', 'geodofs')}`),
      T('geodraw', 'Drawing in the view', ['draw', 'drawing tools', 'add points', 'move points', 'draw lines', 'draw surfaces', 'snap', 'working plane', 'delete node'], `
<p>The tool box under the animation controls sets what a click in the view does:</p>
<table class="hv-table"><tr><th>Tool</th><th>Click</th></tr>
<tr><td>Select / rotate</td><td>Selects a node; dragging rotates the view.</td></tr>
<tr><td>Add points</td><td>Adds a node on the working plane under the pointer. The plane faces the view (Top and Bottom: XY, Front and Back: XZ, Left and Right: YZ) and passes through the selected node, or through 0. <b>Snap</b> rounds the new coordinates.</td></tr>
<tr><td>Move points</td><td>Drag a node within its working plane.</td></tr>
<tr><td>Draw lines</td><td>Click nodes one after the other to connect them; ${K('Esc')} ends the chain.</td></tr>
<tr><td>Draw surfaces</td><td>Click three or four nodes around a face. The fourth closes the surface; ${K('Enter')} closes a triangle; ${K('Esc')} cancels.</td></tr></table>
<p>While a drawing tool is active the view keeps its scale; ${K('Esc')} returns to Select, which fits the view to the model again. ${K('Delete')} removes the selected node together with its lines and surfaces.</p>
${TIP('Choose a standard view (Top, Front …) before adding points: the working plane faces the view, so the new points land where you expect them.')}
${SEE('geomodel', 'geoview')}`),
      T('geofile', 'Saving and opening a geometry', ['osgeo', 'save geometry', 'open geometry', 'UFF', 'UNV', 'universal file', 'sensor layout', 'import geometry'], `
<p><b>Save…</b> (in the view's toolbar, or the window menu) writes the model to a file:</p>
<ul><li><b>OpenSig geometry (.osgeo)</b> – the nodes with their names, lines, surfaces and the cylinder axis. Tick "Include the sensor layout" to store, for every channel, its window name, node, direction, setup and whether it is a reference. When you open the file again, open signal windows with the same names are connected to their nodes automatically – handy when the same structure is measured again.</li>
<li><b>Universal file (.unv)</b> – nodes, lines and surfaces for other modal analysis programs.</li></ul>
<p><b>Open…</b> reads .osgeo files and universal files (.uff, .unv: nodes from datasets 15 and 2411, trace lines from 82 and elements from 2412 – beams become lines, triangles and quadrilaterals surfaces). If the window already has a model, choose whether the file replaces it or is added to it. An .osgeo file opened with ${P('File', 'Open signal…')} or dropped on OpenSig opens in a new Geometry window.</p>
${SEE('geomodel', 'geodofs', 'workspaces')}`),
      T('geodofs', 'Channels (DOFs)', ['DOF', 'DOFs', 'channels', 'sensor', 'direction', 'radial', 'tangential', 'axial', 'cylinder axis', 'reference channel', 'Ref', 'auto assign'], `
<p>In the <b>DOFs</b> tab, assign each measured signal window to a node and a direction – one row per sensor axis.</p>
<p>The signal windows become the parents of the Geometry node, so zooming or playing them updates it.</p>
<ul><li><b>Directions</b>: ±X, ±Y, ±Z, or – for sensors on pipes, towers, tanks and rotors – <b>±R</b> (radial, away from the cylinder axis), <b>±T</b> (tangential, turning around it, right-handed) and <b>±A</b> (along it). <b>Cylinder axis…</b> sets the axis (parallel to X, Y or Z, through a point); the cylinder, cone and circle generators set it for you.</li>
<li><b>Ref</b> marks reference channels. The ODS uses a reference channel as phase 0, and the reference sensors get a ring in the view.</li>
<li><b>Setup</b> says which channels were recorded together. Leave it at 1 when all sensors were measured at once; see ${L('georoving')} for tests in several setups.</li>
<li><b>Auto assign…</b> gives the channels to the nodes one after the other: each node gets the next channel for every direction you choose (for example +X +Y +Z for triaxial sensors). Choose the channels (only those not assigned yet, or all), the node order, the node to start at, nodes to skip (supports, for example) and the windows of the reference sensors. The dialog shows a preview of the assignment.</li></ul>
<p>Arrows in the view show the measured directions: X red, Y green, Z blue, radial orange, tangential purple and axial teal.</p>
${SEE('geomodel', 'geoanim', 'georoving')}`),
      T('geoview', 'Rotating and zooming the model', ['rotate', 'pan', 'zoom model', 'standard views', 'Iso', 'Top', 'Bottom', 'Front', 'Back', 'Left', 'Right', 'editor width', 'show options'], `
<p>Drag in the view to rotate, ${K('Shift')}+drag or the middle button to pan, turn the wheel to zoom and double-click to fit.</p>
<ul><li>Seven standard views: <b>Iso</b>, <b>Top</b> and <b>Bottom</b> (looking along Z), <b>Front</b> and <b>Back</b> (along Y) and <b>Left</b> and <b>Right</b> (along X).</li>
<li><b>Show ▾</b>: node numbers, undeformed model, surfaces, DOF arrows, colour legend, and "Move unmeasured nodes with their neighbours", which lets nodes without sensors follow the mean motion of the nodes they are connected to.</li>
<li>Drag the border between the view and the editor to make the editor wider or narrower; the width is kept with the window. <b>Editor ▸</b> hides the editor for a larger view, <b>Editor ◂</b> brings it back.</li></ul>
${SEE('geodraw', 'geoanim')}`),
      T('geoanim', 'Animation: ODS and mode shapes', ['animation', 'animate', 'ODS', 'operating deflection shape', 'FDD', 'frequency domain decomposition', 'singular values', 'mode shape', 'time animation', 'slow motion', 'dwell', 'sweep', '0° / 180°', 'colour legend', 'scale', 'speed', 'record', 'video', 'WebM', 'MP4'], `
<p>The first box above the view, next to <b>▶ Run</b>, chooses what moves the model:</p>
<ul><li><b>Time (slow motion)</b> – the measured motion (1/1000 to real time) over the visible part of the signals.</li>
<li><b>ODS at a frequency</b> – the operating deflection shape: the amplitude and phase of every channel at that frequency, relative to the reference channel (cross-spectrum ÷ √auto-spectrum of the reference).</li>
<li><b>Mode shape (FDD)</b> – Frequency Domain Decomposition: the cross-spectral matrix of all channels is decomposed at every frequency; at a resonance one singular value dominates and its singular vector is the mode shape. The <b>FDD</b> tab plots the first three singular values; click a peak, or one of the frequency buttons, to animate its mode.</li></ul>
<p>The ODS of channel ${M`k`} at the frequency ${M`f`}, with ${M`r`} the reference channel and ${M`G`} the cross-spectral matrix (see ${L('geomodes')} for it and for the FDD), is</p>
${EQ`\psi_k(f)=\frac{G_{kr}(f)}{\sqrt{G_{rr}(f)}}`}
<h2>The FDD plot</h2>
<p>Drag over a frequency range to show only that range, turn the mouse wheel to zoom in or out around the pointer, ${K('Shift')}+drag to move the range, and double-click (or <b>Whole range</b>) to see all frequencies again. The level axis follows the range shown, the frequency and level under the pointer are shown in the corner, and the peak buttons list the peaks inside the range – zoom into a band to find modes close together. Clicking picks the highest point within a few pixels, so a zoomed plot picks more precisely.</p>
<h2>Playing the animation</h2>
<p>For ODS and mode shapes, the display box chooses <b>Dwell</b> (animate at the frequency), <b>0° / 180°</b> (the two extremes, still: solid and orange) or <b>Sweep</b> (the frequency runs through a range you give). While paused, ◀ and ▶| step the phase by 15° (in Time mode, by a short piece of the signal).</p>
<p>The deformed model is coloured by its motion over the dashed undeformed model; the <b>colour legend</b> on the right gives the scale (0 = still, 100 % = the largest motion). <b>Scale</b> sets the size of the motion and <b>Speed</b> the animation. <b>● Rec</b> records the animation as a video file (WebM or MP4): whole cycles of at least 4 s, one pass of a sweep, or 6 s in Time mode.</p>
${SEE('geodofs', 'geomodes', 'geoview', 'peaks')}`),
      T('geomodes', 'Modes: frequency and damping', ['damping', 'damping ratio', 'EFDD', 'enhanced frequency domain decomposition', 'natural frequency', 'modes', 'mode table', 'MAC', 'MAC matrix', 'correlation function', 'identify modes', 'Excel', 'xlsx', 'copy modes'], `
<p>The <b>Modes</b> tab turns the peaks of the FDD tab into a table of modes with their natural frequency and <b>damping ratio</b>, estimated by <b>Enhanced FDD</b> (EFDD):</p>
<ol><li>Around each peak, the frequencies whose first singular vector still looks like the peak's mode shape (MAC at least the <i>MAC level</i>, 0.8) form the mode's "bell".</li>
<li>The inverse Fourier transform of that bell is the mode's correlation function – it looks like a free decay.</li>
<li>The decay of its extremes gives the damping, its zero crossings the frequency. The correlation is first corrected for the Hann window of the spectra, which otherwise makes the damping look too high.</li></ol>
<h2>Working with the table</h2>
<ul><li><b>Identify modes</b> uses the peaks in the frequency range shown in the FDD tab (zoom the plot first to choose a band); <b>+ Current</b> adds the frequency being animated. <b>▶ Run</b> identifies the modes too and shows the damping on its mode buttons.</li>
<li>The table shows each mode's frequency, damping, the FDD peak and the quality of the decay fit (R²; point at it for the number of extremes and the bell's range). Click a row to animate the mode and to see its correlation function with the fitted decay below; × removes a mode.</li>
<li>The <b>MAC matrix</b> compares the mode shapes: 1 on the diagonal, small values elsewhere. A high value away from the diagonal (red) means two modes look alike – too few sensors to tell them apart, or one mode found twice.</li>
<li><b>Settings…</b>: the averaged segments (fewer give a finer frequency resolution – better for light damping – but noisier curves), the MAC level, the correlation range used for the fit (default 0.9 down to 0.2) and the window correction.</li>
<li><b>Copy</b> puts the table on the clipboard for Excel or Word; <b>Excel…</b> saves a workbook with the sheets Modes, MAC, Mode shapes (per channel, node and direction) and Info (record, settings, method) – and Setups for a test in several setups.</li></ul>
<h2>How it is calculated</h2>
<h3>Spectral matrix and FDD</h3>
<p>All channels are cut into segments of ${M`L=2^p`} samples with 50 % overlap; each segment loses the channel's mean, gets a Hann window and is transformed. The cross-spectral matrix averages the ${M`J`} segments at every line ${M`f_m`}:</p>
${EQ`G_{kl}(f_m)=\frac{1}{J}\sum_{j=1}^{J}X_k^{(j)}(f_m)\,X_l^{(j)*}(f_m)`}
<p>(* is the complex conjugate.) The matrix is Hermitian and positive semi-definite, so its singular value decomposition is</p>
${EQ`\mathbf{G}(f_m)=\mathbf{U}(f_m)\,\mathbf{S}(f_m)\,\mathbf{U}(f_m)^H,\qquad\mathbf{S}=\operatorname{diag}\left(s_1\ge s_2\ge\ldots\right)`}
<p>The FDD tab plots ${M`s_1`}, ${M`s_2`} and ${M`s_3`}. At a peak of ${M`s_1`}, the first singular vector ${M`\mathbf{u}_1`} is the mode shape ${M`\boldsymbol{\varphi}`}, scaled so that its largest component is 1 and real.</p>
<h3>Modal Assurance Criterion</h3>
${EQ`\mathrm{MAC}\left(\boldsymbol{\varphi}_a,\boldsymbol{\varphi}_b\right)=\frac{\left|\boldsymbol{\varphi}_a^H\boldsymbol{\varphi}_b\right|^2}{\left(\boldsymbol{\varphi}_a^H\boldsymbol{\varphi}_a\right)\left(\boldsymbol{\varphi}_b^H\boldsymbol{\varphi}_b\right)}`}
<h3>Damping by Enhanced FDD</h3>
<p>The bell is the run of lines around the peak where ${M`\mathrm{MAC}\left(\mathbf{u}_1(f_m),\boldsymbol{\varphi}\right)`} is at least the MAC level. Transformed back to the time domain, its singular values give the mode's correlation function. It is divided by the correlation of the Hann window itself, ${M`c_w(n)`}, and scaled to 1 at lag 0:</p>
${EQ`r(n)=\frac{1}{c_w(n)}\sum_{m\in\text{bell}}s_1(f_m)\cos\frac{2\pi mn}{L}`}
<p>Between the two correlation levels (0.9 down to 0.2 by default), the extremes ${M`\left|r(t_e)\right|`} – each refined by a parabola – decay as ${M`e^{-\sigma t}`}. A straight line through ${M`\ln\left|r(t_e)\right|`} gives ${M`\sigma`} (R² is the quality of this fit), and the zero crossings of ${M`r`}, half a period apart, give the damped frequency ${M`f_d`}:</p>
${EQ`\omega_d=2\pi f_d,\qquad\omega_n=\sqrt{\sigma^2+\omega_d^2},\qquad f=\frac{\omega_n}{2\pi},\qquad\zeta=\frac{\sigma}{\omega_n}`}
${NOTE('Damping from ambient data scatters: with a few minutes of record, expect about ±0.2–0.5 percentage points. Longer records (10–20 minutes or more, at least a few hundred periods of the lowest mode) give steadier values. The mode table is saved with the workspace.')}
${SEE('geoanim', 'georun', 'georoving')}`),
      T('georun', 'Running the finished model', ['run', '▶ Run', 'run model', 'edit model', 'mode buttons', 'finished model'], `
<p>When the geometry and the channels are ready, press <b>▶ Run</b> (top left).</p>
<p>OpenSig checks the model – it needs nodes and at least one open channel assigned to a node, and warns about channels without a node or with a closed window. Then it finds the modes in the singular values of the spectral matrix, estimates their frequency and damping (${L('geomodes')}) and animates the first one in a view as large as the window, without the editor.</p>
<ul><li>Each mode gets a button with its frequency and damping (<b>1: 3.17 Hz · 1.34 %</b> …); click one to animate it. The line under the view shows "Mode 2 of 4 · damping 1.74 %".</li>
<li>If you chose ODS or Time before, Run keeps that animation.</li>
<li><b>✎ Edit model</b> brings the editor back. Run and Edit model are also in the window menu.</li></ul>
${SEE('geomodes', 'geoanim')}`)
    ]),

    B('roving', 'Roving Tests', '<p>A roving test measures a structure at more points than you have sensors: the sensors are moved in several <b>setups</b>, while a few <b>reference sensors</b> stay in place. OpenSig puts the setups together into full mode shapes. This book explains the method, how to plan and enter the setups, what OpenSig computes, and how to judge the result.</p>', [
      T('georoving', 'What a roving test is', ['roving', 'roving test', 'rover', 'rover mode', 'setup', 'setups', 'multi-setup', 'reference sensors', 'roving sensors', 'combine setups', 'merge mode shapes'], `
<p>An ambient vibration test needs one sensor per measured direction at every point – often more sensors than you have. A <b>roving test</b> measures the points in turn:</p>
<ul><li>Each <b>setup</b> is one recording, with all sensors running at the same time.</li>
<li><b>Reference sensors</b> stay at the same points, in the same directions, in every setup.</li>
<li><b>Roving sensors</b> move to new points after each setup until every point is measured.</li></ul>
<p>For example, with six sensors on a bridge deck measured at ten points (both edges at 5, 10, 15, 20 and 25 m), two references at 10 m and four rovers cover the deck in two setups:</p>
<table class="hv-table"><tr><th></th><th>5 m</th><th>10 m</th><th>15 m</th><th>20 m</th><th>25 m</th></tr>
<tr><td>Setup 1</td><td>rover</td><td><b>reference</b></td><td>rover</td><td>–</td><td>–</td></tr>
<tr><td>Setup 2</td><td>–</td><td><b>reference</b></td><td>–</td><td>rover</td><td>rover</td></tr></table>
<h2>Why references are needed</h2>
<p>The setups are recorded at different times, with different wind, traffic or other excitation. Each setup therefore gives the right <i>shape</i> over its own points, but with its own unknown size and sign. The references measure the same points in every setup, so they show how much each setup's shape must be scaled and turned to fit the others. OpenSig does this for every mode and joins the pieces into one shape over all points.</p>
<h2>What it assumes</h2>
<ul><li>The structure does not change between setups (no change of mass, supports or – as far as possible – temperature).</li>
<li>Every mode you want is excited in every setup, and the references move clearly in it.</li>
<li>All channels have one common sample rate. The setups may differ in length.</li></ul>
<h2>Words used in this book</h2>
<table class="hv-table"><tr><th>Word</th><th>Meaning in OpenSig</th></tr>
<tr><td>Setup</td><td>The channels recorded together: the <b>Setup</b> number in the ${L('geodofs', 'DOFs')} tab</td></tr>
<tr><td>DOF</td><td>A node and a direction, such as node 13, +Z</td></tr>
<tr><td>Shared DOF</td><td>A node and direction measured in more than one setup – usually by a reference sensor. Setups are joined only through shared DOFs.</td></tr>
<tr><td>Reference (Ref)</td><td>A channel ticked in the <b>Ref</b> column. Auto assign puts later setups' references on its node and direction, and the ODS uses it as phase 0.</td></tr>
<tr><td>Combined shape</td><td>The mode shape over all setups, after scaling them onto each other</td></tr></table>
${NOTE('What joins two setups is a node and direction they both measure – not the Ref tick. A reference sensor must therefore keep exactly the same node number and direction in every setup.')}
${SEE('rovplan', 'rovassign', 'rovexample')}`),
      T('rovplan', 'Planning the setups', ['plan', 'number of setups', 'reference position', 'node line', 'record length', 'roving plan'], `
<h2>How many setups</h2>
<p>Count measured directions, not sensors. With <i>D</i> DOFs to measure, <i>N</i> sensor channels and <i>R</i> of them as references, each setup measures <i>N</i> − <i>R</i> new DOFs:</p>
<p style="text-align:center">setups = ( <i>D</i> − <i>R</i> ) ÷ ( <i>N</i> − <i>R</i> ), rounded up</p>
<p>For example, 30 DOFs with 8 channels, 2 of them references: 28 ÷ 6 = 4.7, so 5 setups. The last setup may have fewer rovers; the setups do not need the same number of channels.</p>
<h2>Where to put the references</h2>
<ul><li><b>Where every mode moves.</b> A reference on a node line of a mode sees almost nothing of it, so that mode cannot be scaled: not at midspan for the 2nd bending mode, not on the centre line of a deck for torsion, not near a support.</li>
<li><b>More than one.</b> With one shared DOF the setups can be scaled, but nothing checks them. With two or more, OpenSig also measures how well the setups agree (MAC) and warns when they do not.</li>
<li><b>In the directions you need.</b> If you measure lateral and vertical modes, use at least one lateral and one vertical reference. On a deck, one reference on each edge sees both bending and torsion.</li>
<li><b>Untouched.</b> Leave the reference sensors mounted, in the same orientation and with the same settings, for the whole test.</li></ul>
<h2>Each setup</h2>
<ul><li>Record every setup with the same sample rate. OpenSig needs one common rate for all channels.</li>
<li>Make each record long enough for the lowest mode: a common rule of thumb is at least 1000 periods (about 17 minutes for a 1 Hz mode). Longer records give smoother spectra and better damping estimates.</li>
<li>Note which channel was where in each setup. A small table like the one in ${L('georoving')} saves time later.</li></ul>
${SEE('rovassign', 'georoving')}`),
      T('rovassign', 'Entering the setups (DOFs tab)', ['enter setups', 'Setup column', 'auto assign setups', 'reference channels', 'skip nodes measured in other setups', 'roving assign'], `
<p>Make the model first (${L('geomodel')}), then open the signals of every setup – one window per channel. All of them go into the same Geometry node. In the ${L('geodofs', 'DOFs')} tab each channel gets a node, a direction, a <b>Ref</b> tick and a <b>Setup</b> number.</p>
<h2>The quick way: Auto assign once per setup</h2>
<ol><li>Open the files of <b>setup 1</b>, then <b>Auto assign…</b> with <i>Channels: signals not assigned yet</i> and <i>Setup 1</i>. Type the window numbers of the reference sensors under <i>Reference channels</i> (for example W1 W2) so they get the Ref tick. Check that the references are on the nodes you planned; change a <b>Node</b> cell if not.</li>
<li>Open the files of <b>setup 2</b> and choose <b>Auto assign…</b> again. The <i>Setup</i> number is already 2.
<ul><li>Under <i>Reference channels</i>, give this setup's reference windows. They take the nodes and directions of the earlier references in table order: the lowest window number takes the first reference row of the table, and so on.</li>
<li>Leave <i>Skip nodes measured in other setups</i> on: the roving channels then go to the next nodes not measured yet.</li>
<li>The preview in the dialog shows every channel's node and direction before you press <b>Assign</b>.</li></ul></li>
<li>Repeat for each further setup.</li></ol>
<h2>By hand</h2>
<p>You can also fill the table yourself: <b>Node</b>, <b>Dir.</b> and <b>Ref</b> as usual, and the <b>Setup</b> list (1, 2, … one more than the highest so far) for each channel. Channels with the same number must come from the same recording.</p>
<h2>What the table tells you</h2>
<ul><li>Under the table: <i>Roving test with 2 setups: setup 1: 6 channels · setup 2: 6 channels. Measured in every setup: 3 +Z, 13 +Z</i> – the shared DOFs that tie the setups together.</li>
<li><b>⚠ Setup 3 shares no node and direction with the other setups</b> – that setup cannot be combined. Usually a reference got another node or direction in it.</li>
<li>A setup that shares DOFs with only some setups is still combined, as long as it is connected to the others through a chain of shared DOFs.</li></ul>
${SEE('rovcombine', 'geodofs')}`),
      T('rovcombine', 'How OpenSig combines the setups', ['combine', 'merge shapes', 'scale factor', 'least squares', 'average singular values', 'FDD several setups', 'shared DOF'], `
<p>Everything below happens by itself as soon as the table has more than one setup.</p>
<h2>1. Spectra per setup</h2>
<p>Channels of different setups were not recorded together, so they are never correlated with each other. Each setup gets its own cross-spectral matrix, made the same way as for a single setup (<b>Averaged segments</b> in the FDD tab applies to all of them).</p>
<h2>2. One curve to find the peaks on</h2>
<p>The <b>FDD</b> plot shows each setup's first singular value as a thin line. Each is divided by its own mean level, so a setup with stronger excitation does not dominate, and they are placed on the frequency grid of the first setup (setups of different length have different frequency steps). The thick line is their average. The mode buttons of ▶ Run, the peak list and <b>Identify modes</b> all use this average.</p>
<h2>3. Each setup's shape</h2>
<p>For a chosen frequency, each setup's shape is read at the top of its own first singular value within one frequency step, because a mode can sit slightly higher or lower in one setup (temperature, traffic). The FDD shape is the first singular vector. The ODS is taken relative to the same reference DOF in every setup – or, in a setup without it, its first reference channel.</p>
<h2>4. Scaling the setups onto each other</h2>
<ul><li>The setup with the lowest number is the base; its shape is kept as it is.</li>
<li>Every other setup that shares DOFs with the shape built so far gets one complex factor <i>a</i> – a size and a phase. <i>a</i> is the least-squares fit of its shared values <i>x</i> to the values <i>g</i> already there: <i>a</i> = Σ conj(<i>x</i>) · <i>g</i> ÷ Σ |<i>x</i>|², summed over the shared DOFs.</li>
<li>The setup's values, multiplied by <i>a</i>, are added. A DOF measured in several setups gets the average of their values.</li>
<li>This repeats until no further setup can be attached, so a setup may attach through any setup already combined, not only through the base. A setup that shares nothing is left out, with a warning.</li>
<li>Last, the combined shape is normalised: its largest component becomes 1, with phase 0.</li></ul>
<h2>5. The agreement check</h2>
<p>For each setup with at least two shared DOFs, OpenSig compares its scaled shared values with the combined ones by the MAC (modal assurance criterion): 1 means the same shape, 0 nothing in common. With only one shared DOF a setup can still be scaled, but there is nothing to compare, so no MAC is shown.</p>
${SEE('rovresults', 'geoanim')}`),
      T('rovresults', 'Results and checks', ['roving results', 'damping spread', 'frequency spread', 'MAC setups', 'agreement', 'Setups sheet', 'per setup', 'time animation setup'], `
<h2>Modes tab</h2>
<p><b>Identify modes</b> runs the damping estimate (Enhanced FDD) in every setup separately, for each peak of the averaged curve, and then combines them:</p>
<table class="hv-table"><tr><th>Column</th><th>With several setups</th></tr>
<tr><td>f (Hz)</td><td>The mean of the setups' natural frequencies</td></tr>
<tr><td>Damping (%)</td><td>The mean of the setups, ± their spread (standard deviation). Point at the value to see each setup's frequency and damping.</td></tr>
<tr><td>FDD peak</td><td>The mean of the setups' peaks</td></tr>
<tr><td>Fit R²</td><td>The worst fit of the setups</td></tr></table>
<p>Below the table, OpenSig gives the worst agreement (MAC) of the shared DOFs over all modes and setups.</p>
<h2>Judging the result</h2>
<ul><li><b>MAC 0.95 or more</b>: the setups fit well. <b>Below 0.9</b> OpenSig warns. Common causes: a reference with a different node or direction in one setup, a reference near a node line of that mode, or a mode that is weak in one setup.</li>
<li><b>Frequency spread</b>: the same mode differs little between setups – often a few tenths of a percent. A large spread means a different mode was picked in one setup, or the structure changed.</li>
<li><b>Damping spread</b>: damping estimates scatter much more than frequencies, even within one setup, so expect a clearly larger spread. Longer records reduce it.</li>
<li><b>⚠ Setup … is left out of the shapes</b>: it shares no DOF with the others; see ${L('rovassign')}.</li></ul>
<h2>Animation</h2>
<ul><li><b>FDD</b> and <b>ODS</b> animate the combined shape over all points.</li>
<li><b>Time</b> plays one setup at a time, because the setups were not recorded together. Choose the setup next to the speed; points of the other setups stay still.</li></ul>
<h2>Excel</h2>
<p>With several setups, the <b>Modes</b> sheet gets the frequency spread, the damping spread and the number of setups. A <b>Setups</b> sheet lists, for every mode and setup: frequency, damping, fit R², the number of shared DOFs and their agreement (MAC) – empty for the base setup, the one with the lowest number – and whether the setup was combined. The <b>Mode shapes</b> sheet holds the combined shapes; channels at the same node and direction show the same value.</p>
${SEE('geomodes', 'rovcombine')}`),
      T('rovexample', 'Example: a bridge deck in 2 setups', ['roving example', 'bridge deck roving', 'example setups'], `
<p>${P('Help', 'Examples', 'Bridge deck: roving test in 2 setups')} simulates the test from ${L('georoving')}. It opens twelve signal windows (setup 1 on the left, setup 2 on the right) and a Geometry node.</p>
<h2>The test</h2>
<ul><li>A deck of 30 × 8 m with stations every 5 m. The south edge has nodes 1–7 and the north edge nodes 11–17.</li>
<li>Six vertical (+Z) sensors and 300 s at 100 Hz per setup.</li>
<li><b>References</b>: 10 m on both edges (nodes 3 and 13). One on each edge, so torsion – where the edges move in opposite directions – is seen as well as bending. And not at 15 m, which is a node line of the 2nd bending mode.</li>
<li><b>Setup 1</b> rovers: 5 and 15 m (nodes 2, 12, 4, 14). <b>Setup 2</b> rovers: 20 and 25 m (nodes 5, 15, 6, 16).</li>
<li>The simulated deck has modes at 3.2 Hz (1st bending), 4.7 Hz (1st torsion), 12.1 Hz (2nd bending) and 15.3 Hz (2nd torsion), with 1.5 % and 1.2 % damping.</li></ul>
<h2>Things to look at</h2>
<ol><li><b>DOFs</b> tab: the Setup column, and the line <i>Measured in every setup: 3 +Z, 13 +Z</i>.</li>
<li><b>FDD</b> tab: two thin curves (one per setup) and their thick average, with peaks near the four frequencies.</li>
<li><b>Modes</b> tab: <b>Identify modes</b>. Each mode shows the mean frequency and damping ± spread; point at the damping for setup 1 and setup 2. Compare them with the values the deck was simulated with.</li>
<li>Animate a torsion mode: the combined shape runs over all ten points, the two edges in opposite directions.</li>
<li><b>Time</b> animation: switch between Setup 1 and Setup 2 next to the speed.</li></ol>
<h2>Try it: why two references</h2>
<p>In the DOFs tab, give the setup-2 reference at node 13 another node that is not measured, such as 7. Now only 3 +Z is shared: the setups are still combined, but the agreement check disappears. Give the other setup-2 reference another node too, and setup 2 shares nothing – OpenSig warns and leaves it out. Set both back (or open the example again) to restore the test.</p>
${SEE('georoving', 'rovresults', 'geometry')}`)
    ]),

    B('cablebook', 'Cable Tension', '<p>The tension of stay cables, hangers and ties from the vibration measured on them.</p>', [
      T('cable', 'Cable tension from vibration', ['cable', 'cable tension', 'stay cable', 'hanger', 'tie rod', 'tension', 'vibration method', 'taut string', 'Zui', 'bending stiffness', 'sag', 'design tension', 'accelerometer', 'kN'], `
<p>${P('3D tools', 'Cable tension from vibration…')} – or the cable button right of the Geometry button – estimates the tension of a stay cable, hanger or tie from the acceleration measured on it. A tensioned cable vibrates at a series of almost evenly spaced natural frequencies, ${M`f_n\approx n\,f_1`}, and their spacing grows with the tension. The peaks of the record's spectrum are found by the ${L('peaks')} you know from every signal window; the module picks out the cable's series among them and turns it into the tension, by five methods you can compare.</p>
<h2>Measuring</h2>
<ul><li>Fix an accelerometer across the cable, a few percent of its length from an anchorage (2–5 %). There every mode moves; at the middle, a third or a quarter of the length some modes stand still.</li>
<li>Record ambient vibration (wind, traffic) for 5–10 minutes or more; a longer record gives a smoother spectrum and finer frequencies.</li>
<li>Sample at least 2.5 times as fast as the highest mode you want: 50–100 Hz for long stay cables, 200–500 Hz for short hangers.</li></ul>
<h2>Using it</h2>
<ol><li>Open the record and select its window. Like an FFT, the module uses the <b>visible part</b>: zoom to analyse only a part of the record.</li>
<li>Choose ${P('3D tools', 'Cable tension from vibration…')} and enter the cable data (below). The data are kept for the next cable of the same bridge.</li>
<li>Two linked windows open: a <b>PSD</b> of the record, with its peak detection switched on (the prominence method: peaks at least 8 dB above the valleys beside them), and the <b>cable window</b>, which numbers the detected peaks as the cable's modes. Chosen on a spectrum window instead, the module uses that spectrum and its peak detection.</li>
<li>Tune the peaks with <b>Peak detection…</b> in the cable window (or ${P('Signal tools', 'Peak detection…')} on the PSD window): every method and setting of the ${L('peaks')} can be used, and the cable window follows. If a mode is missing, lower the prominence; if noise peaks get in, raise it. The PSD itself – averaging and resolution – is set in the PSD window's ${L('properties')}.</li>
<li>The cable window shows the spectrum with the detected peaks (orange marks) and the modes found, the tension and its ratio to the design tension, and two tables: the tension by every method, and every mode with its frequency and tension.</li>
<li>In the spectrum, green lines are the modes used, grey dashed lines weak peaks or modes you left out, red dashed lines modes off the harmonic series (another component's peak, or noise). Click a mode – in the table or the spectrum – to leave it out or use it; <b>Automatic modes</b> undoes your clicks.</li>
<li>Click a method in the table, or choose it in <b>Tension from</b>, to make it the result.</li>
<li><b>Copy</b> puts the results on the clipboard for Excel or Word; <b>Excel…</b> saves a workbook with the sheets Tension and Modes. <b>Cable data…</b> changes the data.</li></ol>
<h2>The cable data</h2>
<table class="hv-table"><tr><th>Field</th><th>Meaning</th></tr>
<tr><td>Length L (m)</td><td>The vibrating length: between the anchorages, or between a damper and the far anchorage when the damper holds the cable</td></tr>
<tr><td>Mass per metre m (kg/m)</td><td>Everything that vibrates with the cable: steel, sheath, grout or wax</td></tr>
<tr><td>E (MPa), I (mm⁴)</td><td>The bending stiffness EI. For a strand cable the strands slide on each other, so the stiffness of the separate strands, ${M`I=n_s\pi d^4/64`}, is a common lower value; for a solid bar, ${M`\pi d^4/64`}. I = 0 means no bending stiffness: a taut string</td></tr>
<tr><td>A (mm²), θ (°)</td><td>The steel area and the inclination from horizontal, for the sag parameters λ² and Γ (90° for a vertical hanger: no sag)</td></tr>
<tr><td>Design tension (kN)</td><td>For the ratio of measured to design tension (within ±5 % it is shown green)</td></tr>
<tr><td>Lowest / highest frequency</td><td>The range searched for modes; 0 as the highest: the whole spectrum shown</td></tr>
<tr><td>First frequency, about</td><td>Helps when another peak (of the deck or tower) is taken for the cable's: the search stays within ±15 % of it</td></tr>
<tr><td>Modes, at most</td><td>How many modes are searched</td></tr>
<tr><td>Averaged segments of the PSD</td><td>Only when the PSD window is made: it averages this many half-overlapping segments – more give a smoother spectrum, fewer a finer frequency resolution. Later, change it in the PSD window's properties</td></tr></table>
<h2>Which method?</h2>
<ul><li><b>Beam, clamped ends (exact)</b> – the default: the exact frequencies of a tensioned beam fixed at both ends, with the bending stiffness EI. Right for most anchored cables and hangers. With I = 0 it is the taut string.</li>
<li><b>Beam, hinged ends</b> – a closed formula with EI for ends that can rotate; for clamped short members it gives too much.</li>
<li><b>Taut string</b> – the classic ${M`T=4mL^2(f_n/n)^2`}, without bending stiffness. For long cables it is close; it gives about ${M`4/\xi`} too much (see the parameters below), so a ξ of 200 means 2 %.</li>
<li><b>Fit of several modes</b> – needs no EI: it finds the tension and the bending stiffness from how ${M`f_n/n`} grows with n. It assumes hinged ends; with clamped ends it gives about ${M`4/\xi`} too much.</li>
<li><b>Zui et al. (1996)</b> – the practical formulas of Zui, Shinke and Namita, with bending stiffness and sag, from the first or the second frequency. Widely used for cable-stayed bridges; it needs A and θ for the sag.</li></ul>
<p>The line under the result gives ${M`f_1`}, the bending parameter ${M`\xi=L\sqrt{T/EI}`} (bending stiffness matters below about 200) and Irvine's sag parameter ${M`\lambda^2`} (sag raises the first mode noticeably above about 0.1). When methods differ, the yellow notes say why. ${L('cablemath')} gives every formula.</p>
<h2>Examples</h2>
<p>${P('Help', 'Examples', 'Stay cable: tension from ambient vibration')} and ${P('Help', 'Examples', 'Arch hanger: tension with bending stiffness')} open simulated records of cables with a known tension – 2950 kN and 450 kN – so you can see how close each method comes. On the short hanger the taut string gives far too much.</p>
${SEE('cablemath', 'peaks', 'fft', 'geometry')}`),
      T('cablemath', 'Cable tension: how it is calculated', ['cable formulas', 'string formula', 'beam with tension', 'clamped beam', 'frequency equation', 'Irvine', 'lambda squared', 'sag-extensibility', 'xi', 'Zui Shinke Namita', 'flexural rigidity'], `
<h2>The spectrum and the modes</h2>
<p>The spectrum is the PSD window: the visible part averaged over ${M`J`} half-overlapping segments with a Hann window, zero-padded to twice the next power of 2, in dB (see ${L('fftparams')}). Its ${L('peaks')} finds the peaks – by default the prominence method, local maxima at least 8 dB above the higher of the two valleys beside them, placed between lines by a parabola. The cable window numbers them. Every detected peak is tried as harmonic ${M`n=1\ldots6`} of a first frequency ${M`f`}, with an inharmonicity ${M`b`} for the bending stiffness (0, and 0.0003 to 0.25 in steps of 20 %):</p>
${EQ`f_n=n\,f\sqrt{1+b\,n^2}`}
<p>The ${M`f`} whose first six harmonics fall on the detected peaks that stand out most (each within ±2 %; the height above the local median of the spectrum in dB) wins. Of the candidates within 85 % of the best score, those with the lowest first mode are kept – so twice the first frequency is not taken – and of these the best, with the least bending. Then mode after mode is predicted from the ones found so far, with the straight line ${M`(f_n/n)^2=a+c\,n^2`}, and taken as the detected peak that stands out most within ±20 % of the spacing; a harmonic without a detected peak is skipped. Peaks less than 6 dB above the median are weak. A mode is off the series when ${M`(f_n/n)^2`} lies more than 4 robust standard deviations (1.4826 × the median absolute deviation) and more than 1 % from a Theil–Sen line over ${M`n^2`}. Weak and off-series modes are left out unless you use them.</p>
<h2>Taut string</h2>
${EQ`f_n=\frac{n}{2L}\sqrt{\frac{T}{m}}\qquad\Rightarrow\qquad T_n=4mL^2\left(\frac{f_n}{n}\right)^2`}
<h2>Beam with hinged ends</h2>
${EQ`f_n=\frac{n}{2L}\sqrt{\frac{T}{m}+\frac{n^2\pi^2EI}{mL^2}}\qquad\Rightarrow\qquad T_n=4mL^2\left(\frac{f_n}{n}\right)^2-\frac{n^2\pi^2EI}{L^2}`}
<h2>Beam with clamped ends</h2>
<p>The cable is a beam under the tension ${M`T`}, fixed against deflection and rotation at both ends:</p>
${EQ`EI\,\frac{\partial^4w}{\partial x^4}-T\,\frac{\partial^2w}{\partial x^2}+m\,\frac{\partial^2w}{\partial t^2}=0,\qquad w=\frac{\partial w}{\partial x}=0\ \text{at}\ x=0,\ L`}
<p>A mode ${M`w=W(x)\,e^{i\omega t}`} combines ${M`\cosh\alpha x`}, ${M`\sinh\alpha x`}, ${M`\cos\beta x`} and ${M`\sin\beta x`}, with</p>
${EQ`\alpha^2-\beta^2=\frac{T}{EI},\qquad\alpha^2\beta^2=\frac{m\omega^2}{EI}`}
<p>and the four end conditions have a solution only when</p>
${EQ`2\alpha\beta\left(1-\cosh\alpha L\cos\beta L\right)+\left(\alpha^2-\beta^2\right)\sinh\alpha L\sin\beta L=0`}
<p>The n-th root lies in ${M`n\pi<\beta L<(n+1)\pi`}. OpenSig divides the equation by ${M`\cosh\alpha L`} (so it cannot overflow), finds the root by bisection, and finds the tension that gives the measured ${M`f_n`} by a second bisection between 0 and the string tension (bending only adds stiffness). Without tension the roots are those of a clamped beam, ${M`\beta_1L=4.7300`}; with high tension the frequencies approach ${M`f_n\approx f_n^{\mathrm{string}}\left(1+\frac{2}{\xi}+\frac{4+n^2\pi^2/2}{\xi^2}\right)`}.</p>
<h2>Fit of several modes</h2>
<p>For hinged ends, ${M`(f_n/n)^2`} is a straight line over ${M`n^2`}:</p>
${EQ`\left(\frac{f_n}{n}\right)^2=\frac{T}{4mL^2}+\frac{\pi^2EI}{4mL^4}\,n^2\qquad\Rightarrow\qquad T=4mL^2a,\quad EI=\frac{4mL^4}{\pi^2}\,b`}
<p>where ${M`a`} and ${M`b`} are the intercept and slope of the least-squares line through the modes used. The spread shown is the standard error of ${M`T`} from the intercept's.</p>
<h2>Zui, Shinke and Namita (1996)</h2>
<p>With the sag ratio ${M`\delta`} and</p>
${EQ`C=\sqrt{\frac{EI}{mL^4}},\qquad\xi=L\sqrt{\frac{T}{EI}},\qquad\delta=\frac{mgL\cos\theta}{8T},\qquad\Gamma=\sqrt{\frac{mgL}{128\,EA\,\delta^3\cos^5\theta}}\cdot\frac{0.31\xi+0.5}{0.31\xi-0.5}`}
<table class="hv-table hv-mtable"><tr><th>Sag</th><th>Range</th><th>Tension</th></tr>
<tr><td rowspan="3">${M`\Gamma\ge3`}: the first mode</td><td>${M`17\le\xi`}</td><td>${M`T=4m\left(f_1L\right)^2\left[1-2.20\frac{C}{f_1}-0.550\left(\frac{C}{f_1}\right)^2\right]`}</td></tr>
<tr><td>${M`6\le\xi\le17`}</td><td>${M`T=4m\left(f_1L\right)^2\left[0.865-11.6\left(\frac{C}{f_1}\right)^2\right]`}</td></tr>
<tr><td>${M`0\le\xi\le6`}</td><td>${M`T=4m\left(f_1L\right)^2\left[0.828-10.5\left(\frac{C}{f_1}\right)^2\right]`}</td></tr>
<tr><td rowspan="3">${M`0.17\le\Gamma\le3`}: the second mode</td><td>${M`60\le\xi`}</td><td>${M`T=m\left(f_2L\right)^2\left[1-4.40\frac{C}{f_2}-1.10\left(\frac{C}{f_2}\right)^2\right]`}</td></tr>
<tr><td>${M`17\le\xi\le60`}</td><td>${M`T=m\left(f_2L\right)^2\left[1.03-6.33\frac{C}{f_2}-1.58\left(\frac{C}{f_2}\right)^2\right]`}</td></tr>
<tr><td>${M`0\le\xi\le17`}</td><td>${M`T=m\left(f_2L\right)^2\left[0.882-85.0\left(\frac{C}{f_2}\right)^2\right]`}</td></tr></table>
<p>${M`\xi`} and ${M`\Gamma`} depend on the tension, so OpenSig starts from the string tension and repeats until it no longer changes. When only ${M`f_2`} is used, the second-mode formulas apply. Below ${M`\Gamma=0.17`} the sag is outside the formulas' range.</p>
<h2>Sag and bending parameters</h2>
${EQ`\xi=L\sqrt{\frac{T}{EI}},\qquad\delta=\frac{mgL\cos\theta}{8T},\qquad\lambda^2=\left(\frac{mgL\cos\theta}{T}\right)^2\frac{L}{TL_e/(EA)},\quad L_e=L\left(1+8\delta^2\right)`}
<p>Irvine's ${M`\lambda^2`} measures how much the sag stiffens the symmetric in-plane modes. For small ${M`\lambda^2`} the first frequency rises by about ${M`4\lambda^2/\pi^4`}, so the tension from it is about ${M`8\lambda^2/\pi^4`} too high; the even modes do not change. Clamped ends without sag raise the first frequency by about ${M`2/\xi`}.</p>
<h2>The result</h2>
<p>For the string and the beams, ${M`T`} is the mean of the tensions ${M`T_n`} of the modes used, and the scatter is their standard deviation over the mean. The ratio to the design tension is ${M`T/T_{\mathrm{design}}`}.</p>
${SEE('cable', 'peaks', 'fftparams')}`)]),
    B('meas', 'Instruments', '<p>Instruments measure a single value of their parent window, such as its RMS or dominant frequency, and update with it.</p>', [
      T('instruments', 'Instruments', ['instrument', 'measure', 'gauge', 'statistics', 'alarm', 'critical range'], `
<p>Choose an instrument from the ${P('Instruments')} menu or the instrument buttons on the second toolbar row. It opens as a small window showing one value of the active window's visible part, and recalculates whenever that changes.</p>
${TB('Mean', 'Maximum', 'RMS', 'THD', 'Dominant frequency')}
<ul><li>Many instruments also draw a <b>marker</b> in their parent – for example at the maximum.</li>
<li>${P('Instruments', 'Statistics (show as…)')} shows the current, average, minimum or maximum value over time.</li>
<li>${L('properties', 'Properties')} (${K('Ctrl', 'P')}) set the display (number or gauge), decimals, and a <b>critical range</b> that turns the value red.</li>
<li>${P('Instruments', 'Instrument alarm actions…')} runs actions when a value enters the critical range: play a sound, save the parent's values in a file, or (desktop app) start a program.</li>
<li>${P('Instruments', 'Log instrument values…')} writes the values to a file over time.</li></ul>
${SEE('statinst', 'specinst', 'markers')}`),
      T('statinst', 'Statistical instruments', ['mean', 'median', 'RMS', 'standard deviation', 'variance', 'skewness', 'kurtosis', 'crest factor', 'peak-to-peak', 'quantile', 'entropy', 'fractal dimension'], `
<table class="hv-table"><tr><th>Instrument</th><th>Shows</th></tr>
<tr><td>Mean, Sum, Median, Quantile</td><td>The average, the total, the middle value, a chosen quantile</td></tr>
<tr><td>Standard deviation, Variance</td><td>The spread around the mean</td></tr>
<tr><td>Skewness, Kurtosis</td><td>Asymmetry and peakedness of the distribution; kurtosis rises with impacts</td></tr>
<tr><td>RMS, RMS – normalized</td><td>The effective value</td></tr>
<tr><td>Crest factor</td><td>Peak divided by RMS</td></tr>
<tr><td>Peak-To-Peak, Integral</td><td>Range of the values, area under the curve</td></tr>
<tr><td>Zero-crossing rate</td><td>Zero crossings per second</td></tr>
<tr><td>Peak count, Average peak distance</td><td>From ${L('peaks')}</td></tr>
<tr><td>Fractal dimension, Shannon entropy</td><td>Complexity and information content</td></tr>
<tr><td>Const (level marker)</td><td>A fixed level drawn as a line</td></tr></table>`),
      T('specinst', 'Spectral instruments', ['THD', 'THD+N', 'SNR', 'dB(A)', 'dB(C)', 'dominant frequency', 'fundamental', 'spectral centroid', 'spectral flatness', 'damping', 'harmonics'], `
<table class="hv-table"><tr><th>Instrument</th><th>Shows</th></tr>
<tr><td>Dominant frequency</td><td>The frequency with the highest level</td></tr>
<tr><td>Fundamental frequency</td><td>The base frequency of a harmonic series</td></tr>
<tr><td>Mean / Median frequency</td><td>The level-weighted mean or median of the spectrum</td></tr>
<tr><td>Spectral centroid, Spectral flatness</td><td>The "centre of mass" of the spectrum; how noise-like (1) or tonal (0) it is</td></tr>
<tr><td>THD, THD + Noise</td><td>Total harmonic distortion, with or without noise</td></tr>
<tr><td>Signal-To-Noise Ratio (SNR)</td><td>The level of the main component against the rest</td></tr>
<tr><td>Overall dB (weighted)</td><td>dB(A), dB(C) or dB(Z) level</td></tr>
<tr><td>RMS of a frequency range</td><td>The level in a band you choose</td></tr>
<tr><td>Damping factor</td><td>From the half-power bandwidth of a resonance</td></tr>
<tr><td>Amplitude at max. frequency harmonics</td><td>The level at 2× to 10× the dominant frequency</td></tr>
<tr><td>Sum 3D over frequency range</td><td>A band level over time from a 3D window</td></tr></table>
<h2>How they are calculated</h2>
<p>The frequency instruments use the line powers ${M`\tilde{P}_k`} (${M`k\ge1`}, ${M`f_k=k\,\Delta f`}) of their spectrum window, or of a Hann-windowed FFT when they are attached to a time signal. Each line is corrected for the window's noise bandwidth, so that sums give mean squares:</p>
${EQ`\tilde{P}_k=\frac{2\left|X_k\right|^2}{N_{\mathrm{FFT}}\sum_nw_n^2}`}
<table class="hv-table hv-mtable"><tr><th>Instrument</th><th>Formula</th></tr>
<tr><td>Dominant frequency</td><td>${M`\left(k^*+\delta\right)\Delta f`}, where ${M`k^*`} is the highest line and ${M`\delta=\frac{\tilde{P}_{k^*-1}-\tilde{P}_{k^*+1}}{2\left(\tilde{P}_{k^*-1}-2\tilde{P}_{k^*}+\tilde{P}_{k^*+1}\right)}`} places the top of a parabola through it and its neighbours</td></tr>
<tr><td>Spectral centroid</td><td>${M`\frac{\sum_kf_k\tilde{P}_k}{\sum_k\tilde{P}_k}`}</td></tr>
<tr><td>Mean frequency</td><td>${M`\frac{\sum_kf_k\sqrt{\tilde{P}_k}}{\sum_k\sqrt{\tilde{P}_k}}`} (weighted by amplitude)</td></tr>
<tr><td>Median frequency</td><td>${M`f_m`} for the smallest ${M`m`} with ${M`\sum_{k\le m}\tilde{P}_k\ge\frac{1}{2}\sum_k\tilde{P}_k`}</td></tr>
<tr><td>Spectral flatness</td><td>${M`\frac{\exp\left(\frac{1}{K}\sum_k\ln\tilde{P}_k\right)}{\frac{1}{K}\sum_k\tilde{P}_k}`} – the geometric over the arithmetic mean of the ${M`K`} lines</td></tr>
<tr><td>Overall dB (weighted)</td><td>${M`10\log_{10}\sum_k\tilde{P}_k\,10^{W(f_k)/10}`}, with ${M`W=A(f)`}, ${M`C(f)`} (see ${L('fftparams')}) or 0 for dB(Z)</td></tr>
<tr><td>RMS of a frequency range</td><td>${M`\sqrt{\sum_{f_1\le f_k\le f_2}\tilde{P}_k}`}</td></tr>
<tr><td>Damping factor</td><td>${M`\zeta=\frac{f_2-f_1}{2f_p}`}, ${M`Q=\frac{f_p}{f_2-f_1}`}: the amplitude spectrum falls from its peak ${M`A_p`} at ${M`f_p`} to ${M`A_p/\sqrt{2}`} (−3 dB) at ${M`f_1`} and ${M`f_2`}, interpolated between lines</td></tr>
<tr><td>Amplitude at h× max. frequency</td><td>The highest line within ±2 lines of ${M`h\cdot f_{\mathrm{dom}}`}</td></tr></table>
<p><b>Fundamental frequency</b>, <b>THD</b>, <b>THD + Noise</b> and <b>SNR</b> fit the fundamental and its harmonics (up to 10, below ${M`f_s/2`}) to the time signal by least squares:</p>
${EQ`x_n\approx c_0+\sum_{h=1}^{H}\left(a_h\cos\frac{2\pi hf_1n}{f_s}+b_h\sin\frac{2\pi hf_1n}{f_s}\right),\qquad P_h=\frac{a_h^2+b_h^2}{2}`}
<p>${M`f_1`} starts at the highest FFT line and is refined within ±1 line to the frequency that fits best. ${M`P_N`}, the noise, is the mean square of what the fit leaves over:</p>
${EQ`\mathrm{THD}=100\,\%\cdot\sqrt{\frac{\sum_{h=2}^{H}P_h}{P_1}},\qquad\text{THD+N}=100\,\%\cdot\sqrt{\frac{\sum_{h=2}^{H}P_h+P_N}{P_1}},\qquad\mathrm{SNR}=10\log_{10}\frac{P_1}{P_N}~\mathrm{dB}`}`),
      T('markers', 'Markers', ['marker', 'maximum', 'minimum', 'value at', 'harmonics marker'], `
<ul><li>${P('Instruments', 'Maximum (with marker)')} and ${P('Instruments', 'Minimum (with marker)')} show the extreme value and mark it; the position variants show where it is, also interpolated between samples.</li>
<li>${P('Instruments', 'Value at (with marker)…')} shows the value at a fixed X position.</li>
<li>${P('Instruments', 'Marker with harmonics at…')} marks a frequency and its harmonics.</li></ul>
${SEE('harmonic', 'picker')}`),
      T('picker', 'Value picker', ['pick', 'picker', 'picked values', 'measure points', 'delta', 'Ctrl+Shift+P'], `
<p>The value picker places numbered points on graphs to read and compare exact values. Switch it on with ${P('Instruments', 'Value picker')} (${K('Ctrl', 'Shift', 'P')}) or its toolbar button, then click a graph; ${K('Shift')}+click picks at any time.</p>
<p>${P('Instruments', 'Pick snaps to')} chooses where a point lands: the nearest sample, the highest or lowest value near the mouse, an interpolated position, or exactly where you click. ${P('Instruments', 'Add pick at X…')} places one at a typed position.</p>
<ul><li>Points show "P1 x | y" and follow the data when it changes.</li>
<li>Drag a point to move it, ${K('←')} / ${K('→')} move the selected one by a sample (${K('Shift')}: 10), ${K('Del')} removes it, ${K('Esc')} deselects.</li>
<li>${P('Instruments', 'Picked values table…')} lists X, Y and the differences ΔX, ΔY and 1/ΔX to the previous point – handy for periods and frequencies – and copies them or saves CSV.</li>
<li>In the ${L('control')}, each window's points are one "Picked values" node.</li></ul>
<p>Points are saved with the workspace.</p>`)
    ]),

    B('acq', 'Data Acquisition', '<p>Recording live signals.</p>', [
      T('acquisition', 'Sound card acquisition', ['acquisition', 'record', 'microphone', 'live', 'trigger', 'sound card', 'Ctrl+Q'], `
<p>${P('Data acquisition', 'Open data acquisition…')} (${K('Ctrl', 'Q')}) records from a sound card input, mono or stereo, at a chosen sampling rate. The acquisition window behaves like any source: analyses linked to it update live.</p>
<ul><li><b>Continuous</b> – a scrolling window of the latest data.</li>
<li><b>Last block</b> – the latest block of a fixed length.</li>
<li><b>Timed</b> – records for a set time.</li>
<li><b>Triggered</b> – starts when the signal crosses a level with a given slope, with pre-trigger data and optional re-arm.</li></ul>
<p>Start, stop and reset with ${K('Ctrl', 'R')}, ${K('Ctrl', 'K')} and ${P('Data acquisition', 'Reset acquisition window')}.</p>
${NOTE('In a browser, live input needs the page to be served (not opened as a file) and your permission to use the microphone.')}`),
      T('calibration', 'Calibration', ['calibration', 'units', 'sensitivity', 'cal file'], `
<p>${P('Data acquisition', 'Device calibration…')} converts the raw input values into physical units – for example pascals or m/s² – using a sensitivity per channel. Profiles can be saved and loaded as <code>.cal</code> files.</p>`),
      T('logging', 'Logging data', ['logging', 'log file', 'record to disk', 'sig'], `
<p>${P('Data acquisition', 'Log data in file…')} writes the acquired data to files, splitting them at a chosen size; ${P('Data acquisition', 'Start logging')} and ${P('Data acquisition', 'Stop logging')} control it. ${P('File', 'Open data log file…')} reads them back. Logging to folders needs the desktop app.</p>`),
      T('network', 'Network and serial', ['network', 'UDP', 'TCP', 'serial', 'COM port'], `
<p>The desktop app can receive and send signals over the network (UDP/TCP) and through serial ports: ${P('Data acquisition', 'Network receiver…')}, ${P('Data acquisition', 'Network sender…')}, ${P('Data acquisition', 'Serial input…')} and ${P('Data acquisition', 'Serial output…')}.</p>`)
    ]),

    B('custom', 'Custom Tools and Scripts', '<p>Reusing analyses and extending <i>OpenSig</i>.</p>', [
      T('customtools', 'Custom tools', ['custom tool', 'ost', 'reuse', 'template', 'T1', 'toolbar buttons'], `
<p>A custom tool is a saved analysis chain you can apply to any signal in one click.</p>
<ul><li>${P('File', 'Save window as custom tool')} saves the active window only, the window with every analysis below it, or just the analyses below it. Optionally put it in a menu group.</li>
<li>${P('Signal tools', 'Use custom tool')} lists the built-in tools by group and your own tools; "From file…" opens an <code>.ost</code> file or an FFT settings <code>.swt</code> tool.</li>
<li>${P('File', 'Custom tools toolbar editor…')} puts tools on the toolbar buttons T1–T5.</li></ul>
<p>The desktop app keeps tools in <code>Documents\\OpenSig\\Tools</code>; any <code>.ost</code> file put there is listed.</p>
${MENU('Signal tools', 'Use custom tool')}`),
      T('scripts', 'Script windows', ['script', 'JavaScript', 'process', 'console', 'programming'], `
<p>The ${P('Scripts')} menu creates windows whose result is calculated by your own JavaScript. There are five kinds: a signal, a custom display, a signal source, an instrument and an instrument source.</p>
<p>A script defines <code>process(input_windows, output)</code>: it reads the data of the input windows and fills the output. ${P('Scripts', 'Script parameters…')} declares values you can change without editing the code, and ${P('Scripts', 'JavaScript console')} is for quick experiments.</p>`),
      T('customdisplays', 'Custom displays', ['scatter', 'orbit', 'polar', 'Bode', 'Nyquist', 'box plot', 'violin', 'corner plot', 'correlation plot'], `
<p>${P('Scripts', 'Custom displays')} draws signals in other ways: scatter plots in 2D, 2D with a colour vector or 3D (drag to rotate), orbit, polar, Bode, Bode with Nyquist, box, violin, box plus violin, corner and correlation plots, and a spectrogram contour plot.</p>`)
    ]),

    B('aibook', 'AI Signal Report', '<p>Optional language-model features. They are off until you configure a provider.</p>', [
      T('ai', 'AI signal report', ['AI', 'report', 'LLM', 'Claude', 'metrics', 'privacy', 'API key'], `
<p>${P('AI signal report', 'Generate AI report')} describes a signal in words – a general description, anomaly and fault indicators, a vibration, audio or biomedical assessment, or a one-paragraph summary.</p>
<p>Only computed metrics are sent – statistics, spectral features and peaks – never the raw samples. Configure Anthropic or an OpenAI-compatible endpoint in ${P('AI signal report', 'Settings…')}; API keys are stored only on this computer.</p>
<p>Without a provider you can still ${P('AI signal report', 'Export signal metrics…')} as JSON or ${P('AI signal report', 'Copy analysis prompt to clipboard')} and paste it into any chat assistant.</p>`),
      T('speech', 'Speech-to-text', ['speech', 'transcription', 'audio to text'], `
<p>${P('Signal tools', 'Speech-to-text (visible part)…')} transcribes the visible part of an audio signal through an OpenAI-compatible transcription endpoint configured in the AI settings. This sends the audio of the visible part to that service.</p>`)
    ]),

    B('settingsbook', 'Settings', '', [
      T('settings', 'Application settings', ['settings', 'preferences', 'options', 'number format', 'auto-save', 'playback device', 'F12'], `
<p>${P('File', 'Application settings…')} (${K('Ctrl', ',')}; ${K('F12')} in the desktop app) sets the window style, app icon and dark mode, default display options, the number format for exports and the clipboard, auto-saving and restoring the workspace, and the playback device. ${P('File', 'Application settings – advanced…')} holds the rarely changed options.</p>
<p>${P('Signal tools', 'Spectral analysis defaults…')} sets the parameters used by ${K('Ctrl', 'F')} and the other quick FFT commands.</p>`)
    ])
  ];

  // F1 in a window opens the topic of the tool that made it
  const context = { fft: 'fft', spectrogram: 'spectrogram', fftfilter: 'fftfilter', iirfilter: 'iirfilter', movavg: 'conditioning', detrend: 'conditioning',
    removedc: 'conditioning', removepeaks: 'conditioning', scale: 'conditioning', resample: 'resample', integral: 'integral', differentiate: 'integral',
    sorted: 'integral', autocorr: 'autocorr', envelope: 'envelope', instfreq: 'envelope', envmax: 'envelope', histogram: 'histogram', peakhold: 'hold',
    averager: 'averager', octave: 'octave', filterbank: 'octave', srs: 'srs', overtime: 'overtime', calc: 'calculator', instrument: 'instruments',
    cepstrum: 'zerocross', zerocross: 'zerocross', wavedenoise: 'wavelet', tacho: 'tacho', cwt: 'cwt', align: 'align', report: 'ai', chart: 'customdisplays',
    script: 'scripts', scriptsource: 'scripts', scriptinst: 'scripts', scriptinstsource: 'scripts', scriptdisplay: 'customdisplays', tfftstats: 'timefft',
    track3d: 'cursor3d', filter3d: 'cursor3d', slice: 'cursor3d', sum3d: 'specinst', extract: 'zoom', peaks: 'peaks', edit: 'editnode', geometry: 'geometry', cable: 'cable', video: 'video' };

  // the keyboard table of the "Keyboard and mouse" topic
  const keys = [['F1', 'Help for the active window'], ['Ctrl+O / Ctrl+S', 'Open / save signal'], ['Ctrl+I / Ctrl+L', 'Save / load workspace (desktop: Ctrl+W loads)'], ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous workspace tab (desktop app)'],
    ['Ctrl+F', 'FFT with the default settings'], ['Ctrl+G / Ctrl+T', 'Spectrogram / Time FFT'], ['Ctrl+Y', 'FFT filter'], ['Ctrl+E', 'Open the visible part in a new window'],
    ['Ctrl+A / Ctrl+P', 'Axes settings / Properties'], ['Ctrl+B', 'Copy data as CSV'], ['Ctrl+2', 'Zoom to N samples'], ['Ctrl+D', 'Reset the zoom of all windows'],
    ['+ / −', 'Zoom in / out'], ['Home / End / ← →', 'Navigate'], ['Alt+↑ / Alt+↓', 'Change the play step'],
    ['F5 / F6 / F7', 'Play (no sound) / play with sound from the cursor / stop'], ['Alt+F6 / Ctrl+Alt+F6', 'Play with sound / the visible segment only'],
    ['Ctrl+Q / Ctrl+R / Ctrl+K', 'Open / start / stop acquisition'], ['F2 / F3 / Tab', 'Mesh view / spectrogram view / 3D cursor'],
    ['Enter / Shift+Enter / Esc', 'Pin the harmonic or sideband cursor / pin it on the nearest peak / release it'],
    ['Ctrl+Shift+P', 'Value picker'], ['Ctrl+Shift+G', 'Graph style'], ['Ctrl+Shift+D', 'Dark mode'],
    ['Alt+L / Alt+U / Alt+W', 'Link / unlink / Control Window'], ['Ctrl+,', 'Application settings (desktop: F12)']];

  root.HELPDATA = { home: 'welcome', keysTopic: 'keys', books, context, keys };
})(window);
