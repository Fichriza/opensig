/* OpenSig User Manual (Help ▸ Contents / Index / Search, F1): a help viewer laid out like the Windows HTML Help viewer –
   Hide / Back / Forward / Home on the toolbar, Contents / Index / Search tabs beside the topic, the book of the topic
   under its title, and ◀ ▶ to page through the topics in reading order. F1 opens the topic of the active window's
   tool. The topics are in helpdata.js; menu and toolbar pictures in them are drawn from OpenSig's own menus. */
(function (root) {
  'use strict';
  const { APP, UI } = root, D = root.HELPDATA;
  const S = APP.S, { h } = UI;
  const STORE = 'opensig.help';
  const topics = new Map(), order = [];                    // id → { t, book }; every page in reading order
  for (const b of D.books) {
    topics.set(b.id, { t: b, book: null }); order.push(b.id);
    for (const t of b.topics) { topics.set(t.id, { t, book: b }); order.push(t.id); }
  }
  let el = null, treeEl, idxIn, idxList, srIn, srList, titleEl, crumbEl, bodyEl, prevBtn, nextBtn, backBtn, fwdBtn, hideBtn;
  let hist = [], hpos = -1, cur = null, tab = 'contents', maxRect = null, index = null, results = [];
  const plain = new Map();

  /* ---------- icons (drawn for OpenSig) ---------- */
  const ICO = {
    hide: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" fill="#fff" stroke="#333"/><rect x="2.5" y="4.5" width="19" height="3" fill="#3a6fd8" stroke="#333"/><rect x="3" y="8" width="6" height="11" fill="#d6e4f7"/><path d="M9.5 8v11.5" stroke="#333"/><path d="M7.5 11l-2.5 2.5 2.5 2.5" fill="none" stroke="#c00" stroke-width="1.6"/></svg>',
    show: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" fill="#fff" stroke="#333"/><rect x="2.5" y="4.5" width="19" height="3" fill="#3a6fd8" stroke="#333"/><rect x="3" y="8" width="6" height="11" fill="#d6e4f7"/><path d="M9.5 8v11.5" stroke="#333"/><path d="M5 11l2.5 2.5L5 16" fill="none" stroke="#090" stroke-width="1.6"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M2.5 12L11 4.5V9h10.5v6H11v4.5z" fill="#fff" stroke="#222" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M21.5 12L13 4.5V9H2.5v6H13v4.5z" fill="#fff" stroke="#222" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M5.5 11v9.5h5v-6h3v6h5V11" fill="#fff" stroke="#222" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.5 12.5L12 4l9.5 8.5" fill="none" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 5.5h2.5v4" fill="none" stroke="#222" stroke-width="1.3"/></svg>',
    bookC: '<svg viewBox="0 0 16 16"><path d="M3 1.5h9.5v12H4.2a1.2 1.2 0 0 1-1.2-1.2z" fill="#7b5cc0" stroke="#3b2770"/><path d="M4.2 13.5h8.3v1H4.2a1.2 1.2 0 0 1 0-2.4" fill="#fff" stroke="#3b2770" stroke-width=".8"/><path d="M5 2.5v9" stroke="#b9a5e6"/></svg>',
    bookO: '<svg viewBox="0 0 16 16"><path d="M.8 3.5C3 2.5 5.4 2.6 8 4.3c2.6-1.7 5-1.8 7.2-.8v9.3c-2.2-1-4.6-.9-7.2.8-2.6-1.7-5-1.8-7.2-.8z" fill="#fff" stroke="#3b2770" stroke-linejoin="round"/><path d="M8 4.3v9.3" stroke="#3b2770"/><path d="M2.3 6h4M2.3 8h4M9.7 6h4M9.7 8h4M2.3 10h4M9.7 10h4" stroke="#9aa6c6" stroke-width=".8"/></svg>',
    page: '<svg viewBox="0 0 16 16"><path d="M2.5 1.5h8l3 3v10h-11z" fill="#fff" stroke="#5a5a5a"/><path d="M10.5 1.5v3h3" fill="#e8e8e8" stroke="#5a5a5a"/><path d="M5.6 6.4a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1 .7-1 1.4v.6" fill="none" stroke="#1546c8" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="12.7" r="1" fill="#1546c8"/></svg>',
    prev: '<svg viewBox="0 0 20 16"><path d="M1.5 8l8-6.5v4h9v5h-9v4z" fill="#c9cdd3" stroke="#9aa1aa" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 20 16"><path d="M18.5 8l-8-6.5v4h-9v5h9v4z" fill="#c9cdd3" stroke="#9aa1aa" stroke-linejoin="round"/></svg>'
  };
  const span = (cls, html) => { const s = h('span', { class: cls }); s.innerHTML = html; return s; };

  /* ---------- window ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
  function save() {
    if (!el) return;
    const shown = !el.hidden && el.offsetWidth > 0, old = load();
    const st = { rect: shown && !maxRect ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : old.rect, navW: el.querySelector('.hv-nav').offsetWidth || old.navW,
      navHidden: el.classList.contains('hv-nonav'), tab };
    try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* ignore */ }
  }
  function focus() { el.style.zIndex = ++S.z; el.classList.add('active'); if (S.active) S.active.el.classList.remove('active'); }
  function build() {
    el = h('section', { class: 'win win-help', 'aria-label': 'OpenSig User Manual' });
    el.innerHTML = `<header class="win-head"><span class="win-icon hv-wicon">${ICO.page}</span><span class="win-title">OpenSig User Manual</span>
      <span class="win-btns"><button class="wb" data-act="min" title="Minimize / restore">▁</button><button class="wb" data-act="max" title="Maximize / restore">▢</button><button class="wb" data-act="close" title="Close">✕</button></span></header>
      <div class="hv-bar" role="toolbar" aria-label="Help toolbar">
        <button class="hv-btn" data-act="hide"><span class="hv-bi"></span><span class="hv-bl">Hide</span></button>
        <button class="hv-btn" data-act="back" title="Back (Alt+←)"><span class="hv-bi">${ICO.back}</span><span class="hv-bl">Back</span></button>
        <button class="hv-btn" data-act="fwd" title="Forward (Alt+→)"><span class="hv-bi">${ICO.fwd}</span><span class="hv-bl">Forward</span></button>
        <button class="hv-btn" data-act="home" title="Home"><span class="hv-bi">${ICO.home}</span><span class="hv-bl">Home</span></button></div>
      <div class="hv-main">
        <div class="hv-nav">
          <div class="hv-tabs" role="tablist"><button role="tab" data-tab="contents"><u>C</u>ontents</button><button role="tab" data-tab="index">I<u>n</u>dex</button><button role="tab" data-tab="search"><u>S</u>earch</button></div>
          <div class="hv-pane" data-pane="contents"><ul class="hv-tree" role="tree" tabindex="0" aria-label="Contents"></ul></div>
          <div class="hv-pane" data-pane="index"><label class="hv-lab">Type in the keyword to find:<input class="hv-in" type="text" spellcheck="false"></label>
            <div class="hv-list" role="listbox" tabindex="0" aria-label="Keywords"></div><div class="hv-acts"><button class="btn" data-act="idx-show">Display</button></div></div>
          <div class="hv-pane" data-pane="search"><label class="hv-lab">Type in the word(s) to search for:<input class="hv-in" type="text" spellcheck="false"></label>
            <div class="hv-acts"><button class="btn" data-act="sr-list">List Topics</button><button class="btn" data-act="sr-show">Display</button></div>
            <div class="hv-lab">Select topic to display:</div>
            <div class="hv-res"><div class="hv-rhead"><span>Title</span><span>Location</span><span>Rank</span></div><div class="hv-list hv-rlist" role="listbox" tabindex="0" aria-label="Topics found"></div></div>
            <div class="hv-found"></div></div>
        </div>
        <div class="hv-split" title="Drag to resize"></div>
        <div class="hv-topic"><div class="hv-head"><span class="hv-arrows"><button data-act="prev" title="Previous topic">${ICO.prev}</button><button data-act="next" title="Next topic">${ICO.next}</button></span>
          <h1 class="hv-title"></h1><a class="hv-crumb" href="#"></a></div><div class="hv-body" tabindex="0"></div></div>
      </div><div class="win-resize" title="Resize"></div>`;
    const q = s => el.querySelector(s);
    treeEl = q('.hv-tree'); titleEl = q('.hv-title'); crumbEl = q('.hv-crumb'); bodyEl = q('.hv-body');
    idxIn = q('[data-pane=index] .hv-in'); idxList = q('[data-pane=index] .hv-list'); srIn = q('[data-pane=search] .hv-in'); srList = q('.hv-rlist');
    prevBtn = q('[data-act=prev]'); nextBtn = q('[data-act=next]'); backBtn = q('[data-act=back]'); fwdBtn = q('[data-act=fwd]'); hideBtn = q('[data-act=hide]');
    const st = load(), dw = S.desktop.clientWidth || innerWidth, dh = S.desktop.clientHeight || innerHeight;
    const r = Object.assign({ w: Math.min(820, dw - 20), h: Math.min(600, dh - 20) }, st.rect);
    r.w = Math.max(420, Math.min(r.w, dw)); r.h = Math.max(300, Math.min(r.h, dh));
    if (r.x == null) { r.x = Math.max(0, (dw - r.w) / 2); r.y = Math.max(0, (dh - r.h) / 3); }
    Object.assign(el.style, { left: Math.min(r.x, Math.max(0, dw - 80)) + 'px', top: Math.min(r.y, Math.max(0, dh - 40)) + 'px', width: r.w + 'px', height: r.h + 'px' });
    q('.hv-nav').style.width = Math.max(150, Math.min(st.navW || 210, 480)) + 'px';
    if (st.navHidden) el.classList.add('hv-nonav');
    tab = st.tab || 'contents';
    S.desktop.appendChild(el);
    wire(); buildTree(); setHide();
  }
  function wire() {
    const q = s => el.querySelector(s);
    el.addEventListener('pointerdown', focus, true);
    const dragFrame = (e, resize) => {
      if (e.button !== 0 || e.target.closest('.wb')) return;
      e.preventDefault(); const sx = e.clientX, sy = e.clientY, ox = resize ? el.offsetWidth : el.offsetLeft, oy = resize ? el.offsetHeight : el.offsetTop;
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (resize) { el.style.width = Math.max(360, ox + dx) + 'px'; el.style.height = Math.max(240, oy + dy) + 'px'; }
        else { el.style.left = Math.max(0, ox + dx) + 'px'; el.style.top = Math.max(0, oy + dy) + 'px'; }
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
    q('.win-head').addEventListener('pointerdown', e => dragFrame(e, false));
    q('.win-head').addEventListener('dblclick', e => { if (!e.target.closest('.wb')) toggleMax(); });
    q('.win-resize').addEventListener('pointerdown', e => dragFrame(e, true));
    q('[data-act=close]').addEventListener('click', close);
    q('[data-act=max]').addEventListener('click', toggleMax);
    q('[data-act=min]').addEventListener('click', () => el.classList.toggle('hv-min'));
    // the splitter between the tabs and the topic
    q('.hv-split').addEventListener('pointerdown', e => {
      e.preventDefault(); const nav = q('.hv-nav'), sx = e.clientX, ow = nav.offsetWidth;
      const mv = ev => { nav.style.width = Math.max(140, Math.min(ow + ev.clientX - sx, el.offsetWidth - 200)) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    // toolbar, arrows, breadcrumb
    hideBtn.addEventListener('click', () => { el.classList.toggle('hv-nonav'); setHide(); save(); });
    backBtn.addEventListener('click', () => step(-1));
    fwdBtn.addEventListener('click', () => step(1));
    q('[data-act=home]').addEventListener('click', () => go(D.home));
    prevBtn.addEventListener('click', () => { const i = order.indexOf(cur); if (i > 0) go(order[i - 1]); });
    nextBtn.addEventListener('click', () => { const i = order.indexOf(cur); if (i >= 0 && i < order.length - 1) go(order[i + 1]); });
    crumbEl.addEventListener('click', e => { e.preventDefault(); const b = crumbEl.dataset.t; if (b) go(b); });
    bodyEl.addEventListener('click', e => { const a = e.target.closest('a[data-t]'); if (a) { e.preventDefault(); go(a.dataset.t); } });
    el.addEventListener('keydown', e => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); step(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if (e.altKey && /^[cns]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); showTab({ c: 'contents', n: 'index', s: 'search' }[e.key.toLowerCase()], true); return; }
      if (e.key === 'Escape' && !e.target.closest('input')) { e.stopPropagation(); close(); return; }
      e.stopPropagation(); // keys typed here are not window shortcuts (Del, ←/→, F5 …)
    });
    // tabs
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab, true)));
    // contents tree
    treeEl.addEventListener('click', e => {
      const li = e.target.closest('li'); if (!li) return;
      if (e.target.closest('.hv-exp')) { toggleBook(li); return; }
      if (li.classList.contains('hv-book')) toggleBook(li, true);
      go(li.dataset.id);
    });
    treeEl.addEventListener('keydown', treeKey);
    // index
    idxIn.addEventListener('input', () => { const k = idxIn.value.trim().toLowerCase(); if (!k) return; const r = [...idxList.children].find(x => x.dataset.k && x.dataset.k.startsWith(k)); if (r) { selRow(idxList, r); idxList.scrollTop = r.offsetTop - idxList.offsetTop; } }); // the match at the top
    idxIn.addEventListener('keydown', e => listKey(e, idxList, showIndexSel));
    idxList.addEventListener('keydown', e => listKey(e, idxList, showIndexSel));
    idxList.addEventListener('click', e => { const r = e.target.closest('.hv-li'); if (r) selRow(idxList, r); });
    idxList.addEventListener('dblclick', e => { if (e.target.closest('.hv-li')) showIndexSel(); });
    q('[data-act=idx-show]').addEventListener('click', showIndexSel);
    // search
    q('[data-act=sr-list]').addEventListener('click', listTopics);
    q('[data-act=sr-show]').addEventListener('click', showSearchSel);
    srIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); listTopics(); } else listKey(e, srList, showSearchSel, true); });
    srList.addEventListener('keydown', e => listKey(e, srList, showSearchSel));
    srList.addEventListener('click', e => { const r = e.target.closest('.hv-li'); if (r) selRow(srList, r); });
    srList.addEventListener('dblclick', e => { if (e.target.closest('.hv-li')) showSearchSel(); });
  }
  function setHide() {
    const off = el.classList.contains('hv-nonav');
    hideBtn.querySelector('.hv-bi').innerHTML = off ? ICO.show : ICO.hide; hideBtn.querySelector('.hv-bl').textContent = off ? 'Show' : 'Hide';
    hideBtn.title = off ? 'Show the Contents, Index and Search tabs' : 'Hide the Contents, Index and Search tabs';
  }
  function toggleMax() {
    if (maxRect) { Object.assign(el.style, maxRect); maxRect = null; }
    else { maxRect = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }; Object.assign(el.style, { left: '0px', top: '0px', width: S.desktop.clientWidth + 'px', height: S.desktop.clientHeight + 'px' }); }
    el.classList.remove('hv-min'); save();
  }
  function close() { if (el) { save(); el.hidden = true; } }

  /* ---------- Contents ---------- */
  function buildTree() {
    treeEl.innerHTML = '';
    for (const b of D.books) {
      const li = h('li', { class: 'hv-book', role: 'treeitem', 'aria-expanded': 'false', 'data-id': b.id });
      const row = h('div', { class: 'hv-row' }, h('span', { class: 'hv-exp', 'aria-hidden': 'true' }), span('hv-ico hv-c', ICO.bookC), span('hv-ico hv-o', ICO.bookO), h('span', { class: 'hv-lbl' }, b.title));
      const ul = h('ul', { role: 'group' });
      for (const t of b.topics) ul.append(h('li', { class: 'hv-page', role: 'treeitem', 'data-id': t.id }, h('div', { class: 'hv-row' }, span('hv-ico', ICO.page), h('span', { class: 'hv-lbl' }, t.title))));
      li.append(row, ul); treeEl.append(li);
    }
  }
  function toggleBook(li, open) {
    const on = open != null ? open : !li.classList.contains('open');
    li.classList.toggle('open', on); li.setAttribute('aria-expanded', String(on));
  }
  function syncTree() {
    treeEl.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
    const li = treeEl.querySelector(`li[data-id="${cur}"]`); if (!li) return;
    const book = li.closest('.hv-book'); if (book && book !== li) toggleBook(book, true);
    li.classList.add('sel'); li.setAttribute('aria-selected', 'true');
    const row = li.querySelector('.hv-row'); if (row && tab === 'contents' && !el.classList.contains('hv-nonav')) row.scrollIntoView({ block: 'nearest' });
  }
  function treeKey(e) {
    const rows = [...treeEl.querySelectorAll('li')].filter(li => li.offsetParent !== null), li = treeEl.querySelector('li.sel') || rows[0];
    if (!li) return;
    const i = rows.indexOf(li), book = li.classList.contains('hv-book');
    const pick = x => { if (x) go(x.dataset.id); };
    if (e.key === 'ArrowDown') pick(rows[i + 1]);
    else if (e.key === 'ArrowUp') pick(rows[i - 1]);
    else if (e.key === 'ArrowRight') { if (book && !li.classList.contains('open')) toggleBook(li, true); else if (book) pick(li.querySelector('li')); }
    else if (e.key === 'ArrowLeft') { if (book && li.classList.contains('open')) toggleBook(li, false); else if (!book) pick(li.closest('.hv-book')); }
    else if (e.key === 'Enter' || e.key === ' ') { if (book) toggleBook(li); pick(li); }
    else if (e.key === 'Home') pick(rows[0]); else if (e.key === 'End') pick(rows[rows.length - 1]);
    else return;
    e.preventDefault();
  }

  /* ---------- Index ---------- */
  function buildIndex() {
    const m = new Map();
    const add = (k, id) => { const lk = k.toLowerCase(); if (!m.has(lk)) m.set(lk, { k, ids: [] }); const x = m.get(lk); if (!x.ids.includes(id)) x.ids.push(id); };
    for (const id of order) { const t = topics.get(id).t; if (t.book) continue; add(t.title, id); (t.kw || []).forEach(k => add(k, id)); }
    index = [...m.values()].sort((a, b) => a.k.localeCompare(b.k, undefined, { sensitivity: 'base' }));
    idxList.innerHTML = '';
    for (const x of index) {
      if (x.ids.length === 1) { idxList.append(h('div', { class: 'hv-li', role: 'option', 'data-id': x.ids[0], 'data-k': x.k.toLowerCase() }, x.k)); continue; }
      idxList.append(h('div', { class: 'hv-li hv-kw', role: 'option', 'data-id': x.ids[0], 'data-k': x.k.toLowerCase() }, x.k));
      for (const id of x.ids) idxList.append(h('div', { class: 'hv-li hv-sub', role: 'option', 'data-id': id }, topics.get(id).t.title));
    }
  }
  function showIndexSel() { const r = idxList.querySelector('.sel'); if (r) go(r.dataset.id); }

  /* ---------- Search ---------- */
  function textOf(t) {
    if (!plain.has(t.id)) { const d = document.createElement('div'); d.innerHTML = t.html || ''; plain.set(t.id, (t.title + ' \n ' + d.textContent).toLowerCase()); }
    return plain.get(t.id);
  }
  const wordsOf = s => (s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#./-]*/gu) || []).map(w => w.replace(/[./-]+$/, '')).filter(Boolean);
  function count(s, w) { let n = 0, i = s.indexOf(w); while (i >= 0) { n++; i = s.indexOf(w, i + w.length); } return n; }
  function search(q) {
    const ws = wordsOf(q); if (!ws.length) return [];
    const out = [];
    for (const id of order) {
      const t = topics.get(id).t; if (t.book && !t.html) continue;
      const s = textOf(t), title = t.title.toLowerCase(); let rank = 0;
      for (const w of ws) { const n = count(s, w); if (!n) { rank = -1; break; } rank += n + (title.includes(w) ? 20 : 0); }
      if (rank > 0 && ws.length > 1) rank += 15 * count(s, ws.join(' ')); // the words as a phrase
      if (rank > 0) out.push({ id, rank });
    }
    return out.sort((a, b) => b.rank - a.rank);
  }
  function listTopics() {
    results = search(srIn.value); srList.innerHTML = '';
    results.forEach((r, i) => {
      const e = topics.get(r.id);
      srList.append(h('div', { class: 'hv-li hv-rrow', role: 'option', 'data-id': r.id }, h('span', {}, e.t.title), h('span', {}, e.book ? e.book.title : 'Contents'), h('span', {}, String(i + 1))));
    });
    el.querySelector('.hv-found').textContent = srIn.value.trim() ? `Found: ${results.length}` : '';
    if (srList.firstChild) selRow(srList, srList.firstChild);
  }
  function showSearchSel() { const r = srList.querySelector('.sel'); if (r) go(r.dataset.id, { marks: wordsOf(srIn.value) }); }

  // lists (index, search results): ↑/↓ select, Enter shows
  function selRow(list, r) { list.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); r.classList.add('sel'); r.scrollIntoView({ block: 'nearest' }); }
  function listKey(e, list, show, inputOnlyArrows) {
    const rows = [...list.children], i = rows.indexOf(list.querySelector('.sel'));
    if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); selRow(list, rows[Math.min(rows.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp' && rows.length) { e.preventDefault(); selRow(list, rows[Math.max(0, i - 1)]); }
    else if (e.key === 'Enter' && !inputOnlyArrows) { e.preventDefault(); show(); }
  }

  /* ---------- tabs ---------- */
  function showTab(name, focusIt) {
    tab = name;
    el.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    el.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== name; });
    if (name === 'index' && !index) buildIndex();
    if (el.classList.contains('hv-nonav')) { el.classList.remove('hv-nonav'); setHide(); }
    if (focusIt) (name === 'contents' ? treeEl : name === 'index' ? idxIn : srIn).focus({ preventScroll: true });
    if (name === 'contents') syncTree();
    save();
  }

  /* ---------- topics ---------- */
  function go(id, opt = {}) {
    if (!topics.has(id)) id = D.home;
    if (hist[hpos] !== id) { hist = hist.slice(0, hpos + 1); hist.push(id); hpos = hist.length - 1; }
    render(id, opt);
  }
  function step(d) { const p = hpos + d; if (p < 0 || p >= hist.length) return; hpos = p; render(hist[p]); }
  function render(id, opt = {}) {
    const { t, book } = topics.get(id);
    cur = id;
    titleEl.textContent = t.title;
    crumbEl.textContent = book ? book.title + ' ››' : t.book ? 'Contents ››' : '';
    crumbEl.dataset.t = book ? book.id : '';
    crumbEl.classList.toggle('hv-nolink', !book);
    bodyEl.innerHTML = t.book ? bookPage(t) : t.html;
    decorate(bodyEl);
    if (opt.marks && opt.marks.length) highlight(bodyEl, opt.marks);
    bodyEl.scrollTop = 0;
    const i = order.indexOf(id);
    prevBtn.disabled = i <= 0; nextBtn.disabled = i >= order.length - 1;
    backBtn.disabled = hpos <= 0; fwdBtn.disabled = hpos >= hist.length - 1;
    syncTree();
  }
  function summary(t) { // the first sentence of a topic, for its book's page
    const d = document.createElement('div'); d.innerHTML = t.html; d.querySelectorAll('.hv-shot').forEach(x => x.remove());
    const txt = d.textContent.replace(/\s+/g, ' ').trim(), m = /^(.{20,170}?[.:])(\s|$)/.exec(txt);
    return m ? m[1] : txt.length > 150 ? txt.slice(0, 150) + '…' : txt;
  }
  function bookPage(b) {
    return (b.html || '') + '<h2>In this book</h2><dl class="hv-toc">' + b.topics.map(t => `<dt><a data-t="${t.id}"></a></dt><dd>${esc(summary(t))}</dd>`).join('') + '</dl>';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // links get their titles; [data-menu] / [data-tb] / .hv-keys become pictures of OpenSig's own menus, toolbar, keys
  function decorate(root0) {
    root0.querySelectorAll('a[data-t]').forEach(a => { const e = topics.get(a.dataset.t); a.href = '#' + a.dataset.t; if (!a.textContent && e) a.textContent = e.t.title; if (!e) a.classList.add('hv-dead'); });
    root0.querySelectorAll('.hv-shot').forEach(s => {
      if (s.dataset.tb) { const strip = toolbarShot(s.dataset.tb.split('|')); if (strip) s.append(strip); }
      if (s.dataset.menu) { const [m, sub, hl] = s.dataset.menu.split('|'); const box = menuShot(m, sub, hl); if (box) s.append(box); }
      if (!s.childNodes.length) s.remove();
    });
    root0.querySelectorAll('.hv-keys').forEach(k => {
      const tb = h('table', { class: 'hv-table' }, h('tr', {}, h('th', {}, 'Keys'), h('th', {}, 'Command')));
      for (const [keys, what] of D.keys) {
        const td = h('td', {}); keys.split(' / ').forEach((alt, i) => { if (i) td.append(' / '); alt.split('+').forEach((x, j) => { if (j) td.append('+'); td.append(h('kbd', {}, x)); }); });
        tb.append(h('tr', {}, td, h('td', {}, what)));
      }
      k.replaceWith(tb);
    });
    if (/Mac/.test(navigator.platform || navigator.userAgent || '')) macKbd(root0);
  }
  // Ctrl / Alt / Shift as ⌘ / ⌥ / ⇧ on a Mac; Ctrl+Q (acquisition) is Control+Q there because Cmd+Q quits
  function macKbd(node) {
    node.querySelectorAll('kbd').forEach(k => {
      const t = k.textContent;
      if (t === 'Ctrl') { let n = k.nextSibling; while (n && n.nodeType === 3 && n.nodeValue === '+') n = n.nextSibling; k.textContent = n && n.textContent === 'Q' ? '⌃' : '⌘'; }
      else if (t === 'Alt') k.textContent = '⌥';
      else if (t === 'Shift') k.textContent = '⇧';
    });
  }
  function findIn(items, label) {
    for (const it of items) { if (it === '-') continue; if (it.label === label) return it; const s = it.sub; if (Array.isArray(s)) { const r = findIn(s, label); if (r) return r; } }
    return null;
  }
  function menuShot(menu, sub, hl) {
    const m = UI.MENUS.find(x => x.label === menu); if (!m) return null;
    let items = m.items;
    if (sub) { const it = findIn(items, sub); if (!it || !Array.isArray(it.sub)) return null; items = it.sub; }
    const box = h('div', { class: 'hv-menu', 'aria-hidden': 'true' });
    for (const it of items) {
      if (it === '-') { box.append(h('div', { class: 'hv-msep' })); continue; }
      box.append(h('div', { class: 'hv-mi' + (hl && it.label === hl ? ' on' : '') }, h('span', {}, it.label), h('span', { class: 'hv-mk' }, it.sub ? '▸' : (it.key || ''))));
    }
    return box;
  }
  function toolbarShot(titles) {
    const strip = h('div', { class: 'hv-tbstrip', 'aria-hidden': 'true' });
    for (const t of titles) {
      const b = [...document.querySelectorAll('.tb-btn[title]')].find(x => x.title.toLowerCase().startsWith(t.toLowerCase()));
      if (!b) continue;
      const c = b.cloneNode(true); c.removeAttribute('id'); c.tabIndex = -1; c.disabled = false; c.classList.remove('on'); strip.append(c);
    }
    return strip.childNodes.length ? strip : null;
  }
  function highlight(node, words) { // marks the search words in the topic text
    const src = '(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', re = new RegExp(src, 'gi'), has = new RegExp(src, 'i');
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('.hv-shot, script, style') || !has.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const list = []; while (walker.nextNode()) list.push(walker.currentNode);
    for (const n of list) {
      re.lastIndex = 0; const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = re.exec(n.nodeValue))) { frag.append(n.nodeValue.slice(last, m.index), h('mark', { class: 'hv-hit' }, m[0])); last = m.index + m[0].length; }
      frag.append(n.nodeValue.slice(last)); n.replaceWith(frag);
    }
    const first = node.querySelector('.hv-hit'); if (first) requestAnimationFrame(() => first.scrollIntoView({ block: 'center' }));
  }

  /* ---------- API ---------- */
  function open(id, tabName) {
    if (!el) build();
    el.hidden = false; focus();
    showTab(tabName || tab, !!tabName);
    go(id || cur || D.home);
    if (!tabName) bodyEl.focus({ preventScroll: true });
  }
  function context() { // F1: the topic of the active window's tool
    const w = S.active;
    let id = null;
    if (w) {
      if (w.op) id = w.op.type === 'geometry' && root.GEOMETRY ? root.GEOMETRY.helpTopic(w) : D.context[w.op.type];
      if (!id && w.kind === 'instrument') id = 'instruments';
      if (!id && w.kind === '3d') id = 'views3d';
      if (!id && !w.op) id = w.source && w.source.type === 'acq' ? 'acquisition' : w.source && w.source.type === 'generator' ? 'generator' : 'zoom';
    }
    open(id || D.keysTopic);
  }
  root.HELP = { open, context, index: () => open(null, 'index'), search: () => open(null, 'search'), topics: () => order.slice() };
})(window);
