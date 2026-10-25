/* OpenSig app icons: the logo on the welcome screen, in the About box, as the browser tab icon and – in the desktop
   app – as the window and taskbar icon. File ▸ Application settings ▸ App icon chooses one. All are drawn for
   OpenSig; "Blue wave" is the icon of OpenSig.exe and the Mac app (desktop/build.ps1, mac/make-icon.py). */
(function (root) {
  'use strict';
  const { APP, UI, HOST } = root, { S } = APP, { h } = UI;

  // SVG path through f(t) for t in 0…1
  const path = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n)).map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join('');
  // the decaying wave of the original icon: 1.5 periods, as in build.ps1
  const wave = (x0, x1, y0, a) => path(60, t => [x0 + (x1 - x0) * t, y0 - a * Math.sin(t * 3 * Math.PI) * Math.exp(-0.98 * t)]);
  const stroke = (d, color, width, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const tile = (fill, more = '') => `<rect x="3" y="3" width="58" height="58" rx="11" fill="${fill}"${more}/>`;

  // each draws into a 64 × 64 viewBox; id makes its gradient ids unique on the page
  const LOGOS = [
    { key: 'classic', name: 'Blue wave', svg: id => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#286ee6"/><stop offset="1" stop-color="#0a3296"/></linearGradient></defs>
      <circle cx="32" cy="32" r="31" fill="url(#${id})"/>${stroke(wave(11.5, 52.5, 32, 16), '#fff', 4.9)}` },
    { key: 'black', name: 'Black wave', svg: id => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c3c3c"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
      <circle cx="32" cy="32" r="31" fill="url(#${id})"/>${stroke(wave(11.5, 52.5, 32, 16), '#fff', 4.9)}` },
    { key: 'scope', name: 'Oscilloscope', svg: () => {
      const d = path(60, t => [9 + 46 * t, 32 - 12 * Math.sin(t * 4 * Math.PI)]);
      return `<rect x="2" y="7" width="60" height="50" rx="7" fill="#353b42"/><rect x="7" y="12" width="50" height="40" rx="3" fill="#05260f"/>
        <path d="M7 22h50M7 32h50M7 42h50M17 12v40M27 12v40M37 12v40M47 12v40" stroke="#17532a" stroke-width=".9"/>
        ${stroke(d, '#39ff14', 6, ' stroke-opacity=".28"')}${stroke(d, '#a6ff85', 2.3)}`;
    } },
    { key: 'spectrum', name: 'Spectrum', svg: () => {
      const hs = [9, 14, 34, 12, 7, 21, 6, 4], col = k => k === 2 ? '#e0392b' : k === 5 ? '#f08c2c' : '#3d7be6';
      return `${tile('#fff', ' stroke="#c3cedc" stroke-width="2"')}` + hs.map((v, k) => `<rect x="${14.5 + k * 5}" y="${49 - v}" width="3.6" height="${v}" rx="1" fill="${col(k)}"/>`).join('') +
        stroke('M12 50H54M12 50V12', '#55667b', 2);
    } },
    { key: 'spectrogram', name: 'Spectrogram', svg: id => {
      const d = path(50, t => [11 + 43 * t, 52 - 40 * Math.pow(t, 2.2)]);
      return `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#03104f"/><stop offset="1" stop-color="#0f33ad"/></linearGradient>
        <linearGradient id="${id}c" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffe14a"/><stop offset=".55" stop-color="#ff6a1a"/><stop offset="1" stop-color="#e3001b"/></linearGradient></defs>
        ${tile(`url(#${id})`)}<path d="M8 47h48M8 39h48M8 31h48M8 23h48M8 15h48" stroke="#2a7bd8" stroke-opacity=".35" stroke-width="2.5"/>
        ${stroke(d, '#ffd24a', 9, ' stroke-opacity=".3"')}${stroke(d, `url(#${id}c)`, 4.2)}`;
    } },
    { key: 'modes', name: 'Mode shape', svg: id => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f7ff"/><stop offset="1" stop-color="#c3daf5"/></linearGradient></defs>
      ${tile(`url(#${id})`, ' stroke="#9db9dc" stroke-width="1.5"')}${stroke('M17 44v8M46 44v8M13 52h8M42 52h8', '#56616d', 2.2)}
      <path d="M8 44l9-6h40l-9 6z" fill="#a9c8f0" stroke="#1d4f8a" stroke-width="1.8" stroke-linejoin="round"/>
      ${stroke(path(50, t => [9 + 46 * t, 27 - 13 * Math.sin(t * 2 * Math.PI)]), '#d4241c', 3.6)}
      <g fill="#1d4f8a"><circle cx="8" cy="44" r="1.9"/><circle cx="28" cy="44" r="1.9"/><circle cx="48" cy="44" r="1.9"/></g>` },
    { key: 'retro', name: 'Retro grey', svg: () => `<rect x="4" y="4" width="56" height="56" fill="#c0c0c0"/>
      <g fill="none" stroke-width="3"><path d="M5.5 58.5V5.5h53" stroke="#fff"/><path d="M4 58.5h54.5V4" stroke="#404040"/></g>
      <rect x="13" y="13" width="38" height="38" fill="#008080"/>
      <g fill="none" stroke-width="2"><path d="M13 51V13h38" stroke="#808080"/><path d="M13 51h38V13" stroke="#fff"/></g>
      ${stroke(wave(17, 47, 32, 11), '#fff', 3.2)}` },
    { key: 'mono', name: 'Black and white', svg: () => `<circle cx="32" cy="32" r="29" fill="#fff" stroke="#111" stroke-width="4"/>${stroke(wave(12.5, 51.5, 32, 15), '#111', 4.6)}` }
  ];

  let seq = 0;
  const find = key => LOGOS.find(l => l.key === key) || LOGOS[0];
  const svg = (key, size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${find(key).svg('oslogo' + ++seq)}</svg>`;
  const node = (key, size) => { const t = document.createElement('template'); t.innerHTML = svg(key, size); return t.content.firstChild; };
  const dataUrl = (key, size) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(key, size));
  async function png(key, size) { // base64 PNG of a logo, for the desktop window icon
    const img = new Image(); img.src = dataUrl(key, size); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png').split(',')[1];
  }

  // shows the chosen logo on the welcome screen, as the browser tab icon and as the desktop app's window icon
  async function apply() {
    const key = find(S.settings.appIcon).key, slot = document.getElementById('app-logo');
    if (slot) slot.replaceChildren(node(key, 40));
    let link = document.getElementById('app-favicon');
    if (!link) { link = h('link', { id: 'app-favicon', rel: 'icon', type: 'image/svg+xml' }); document.head.append(link); }
    link.href = dataUrl(key, 64);
    if (HOST.available) { // "Blue wave" is the exe's own icon; an older host without setIcon keeps it
      try { await HOST.call('setIcon', key === 'classic' ? { reset: true } : { png: await png(key, 64) }); } catch (e) { /* keep the icon */ }
    }
  }
  // radio options with pictures (Application settings)
  const options = () => LOGOS.map(l => [l.key, h('span', { class: 'icon-choice' }, node(l.key, 40), h('span', {}, l.name))]);

  root.LOGOS = { list: LOGOS, svg, node, apply, options };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})(window);
