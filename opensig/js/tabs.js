/* OpenSig workspace tabs: every workspace has its tab above the desktop (state in APP.tabs). Click a tab to show its
   windows, double-click to rename it, × or a middle click closes it, + adds an empty workspace; Ctrl+Tab /
   Ctrl+Shift+Tab step through the tabs. A workspace file opens in a tab of its own. */
(function (root) {
  'use strict';
  const { APP, UI } = root, T = APP.tabs, { h, dialog, confirmBox, guard } = UI;
  const bar = document.getElementById('wstabs'), els = new Map(); // tab → its element

  async function rename(t) {
    const v = await dialog({ title: 'Rename workspace tab', fields: [{ key: 'name', label: 'Name', type: 'text', value: t.name }], ok: 'Rename' });
    if (v) T.rename(t, v.name);
  }
  async function close(t) {
    const n = t.wins.size;
    if (n && !await confirmBox('Close workspace tab', `Close "${t.name}" and its ${n} window${n > 1 ? 's' : ''}?`)) return;
    T.close(t);
  }
  const newTab = () => T.select(T.add());

  function tabEl(t) {
    const x = h('button', { class: 'ws-x', title: 'Close workspace tab', 'aria-label': 'Close workspace tab' }, '×');
    const el = h('div', { class: 'ws-tab', role: 'tab' }, h('span', { class: 'ws-name' }), x);
    el.addEventListener('click', e => { if (e.target !== x) T.select(t); });
    el.addEventListener('dblclick', e => { if (e.target !== x) guard(() => rename(t))(); });
    el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no auto-scroll
    el.addEventListener('auxclick', e => { if (e.button === 1) guard(() => close(t))(); });
    x.addEventListener('click', guard(() => close(t)));
    return el;
  }
  const add = h('button', { class: 'ws-add', title: 'New workspace tab', 'aria-label': 'New workspace tab' }, '+');
  add.addEventListener('click', newTab);
  bar.append(add);

  // elements are kept and only moved when the order changes, so a double-click lands on the same tab
  let shown = null;
  function render() {
    const list = T.list(), cur = T.current();
    for (const [t, el] of els) if (!list.includes(t)) { el.remove(); els.delete(t); }
    let ref = bar.firstChild;
    for (const t of list) {
      let el = els.get(t); if (!el) els.set(t, el = tabEl(t));
      if (el === ref) ref = ref.nextSibling; else bar.insertBefore(el, ref);
      const n = t.wins.size, on = t === cur;
      el.classList.toggle('on', on); el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.firstChild.textContent = t.name;
      el.title = `${t.name} – ${n ? n + ' window' + (n > 1 ? 's' : '') : 'empty'}\nDouble-click to rename`;
    }
    if (cur !== shown && els.get(cur)) { shown = cur; els.get(cur).scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  APP.onChange(render);

  UI.MENUS.find(m => m.label === 'Window').items.push('-',
    { label: 'New workspace tab', run: newTab },
    { label: 'Rename workspace tab…', run: () => rename(T.current()) },
    { label: 'Close workspace tab', run: () => close(T.current()) },
    { label: 'Next workspace tab', key: 'Ctrl+Tab', en: () => T.list().length > 1, run: () => T.step(1) },
    { label: 'Previous workspace tab', key: 'Ctrl+Shift+Tab', en: () => T.list().length > 1, run: () => T.step(-1) });
})(window);
