'use strict';
/* Sensorium – baut das Panel aus dem Profil, wechselt die Seiten und skaliert auf die Fenstergröße. */
(() => {
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  const errorBox = document.getElementById('error');
  const PAGE_KEY = 'sensorium.page';
  let profile = null;
  let pages = [];
  let pageIndex = 0;
  let size = { w: 1920, h: 1080 };
  let notice = null, toastBox = null, toastTimer = 0, lastWheel = 0;
  const ruleState = new Map();

  // Zuletzt gezeigte Seite merken (überlebt einen Neuaufbau der Anzeige).
  function loadPage() { try { return localStorage.getItem(PAGE_KEY); } catch { return null; } }
  function savePage(id) { try { localStorage.setItem(PAGE_KEY, id); } catch { /* ohne Speicher eben nicht */ } }
  const pageId = (p, i) => String(p.id || p.short || p.name || i);

  function build(p) {
    const first = profile == null;
    profile = p;
    pages = Array.isArray(p.pages) && p.pages.length ? p.pages : [p];
    size = { w: (p.canvas && p.canvas.width) || 1920, h: (p.canvas && p.canvas.height) || 1080 };
    Sx.applyTheme(p.theme);
    ruleState.clear();
    let index = pageIndex;
    if (first) {
      // ?seite=zuhause erzwingt eine Seite (für Bildschirmfotos), sonst die zuletzt gezeigte.
      const wanted = new URLSearchParams(location.search).get('seite') ?? loadPage();
      const found = pages.findIndex((pg, i) => pageId(pg, i) === wanted);
      if (found >= 0) index = found;
    }
    showPage(Math.min(index, pages.length - 1), false);
  }

  function showPage(i, remember = true) {
    pageIndex = ((i % pages.length) + pages.length) % pages.length;
    const page = pages[pageIndex];
    Widgets.reset();
    stage.textContent = '';
    stage.style.width = size.w + 'px';
    stage.style.height = size.h + 'px';
    for (const w of page.widgets || []) Widgets.mount(w, stage);
    renderPager();
    notice = null;
    if (page.requires === 'ha') {
      notice = document.createElement('div');
      notice.className = 'notice';
      notice.hidden = true;
      stage.append(notice);
    }
    toastBox = null;
    fit();
    Widgets.update();
    updateNotice();
    if (remember) savePage(pageId(page, pageIndex));
  }

  /** Seiten, die gezeigt werden: solche mit "requires": "ha" nur, wenn Home Assistant eingerichtet ist. */
  function shownPages() {
    const noHa = Sx.get('ha.status') === 'nicht eingerichtet';
    return pages.map((p, i) => i).filter(i => !(noHa && pages[i].requires === 'ha'));
  }
  let shownKey = '';
  function checkShownPages() {
    const shown = shownPages(), key = shown.join(',');
    if (key === shownKey) return;
    shownKey = key;
    showPage(shown.includes(pageIndex) ? pageIndex : (shown[0] ?? 0), false);
  }

  /** Umschalter unten in der Mitte: ein Knopf je Seite. */
  function renderPager() {
    const shown = shownPages();
    shownKey = shown.join(',');
    if (shown.length < 2 || profile.switcher === false) return;
    const cfg = profile.switcher || {};
    const bar = document.createElement('div');
    bar.className = 'pager';
    bar.style.top = (cfg.y ?? size.h - 22) + 'px';
    pages.forEach((pg, i) => {
      if (!shown.includes(i)) return;
      const pill = document.createElement('div');
      pill.className = 'pg' + (i === pageIndex ? ' on' : '');
      pill.textContent = pg.short || pg.name || `Seite ${i + 1}`;
      pill.addEventListener('click', e => {
        e.stopPropagation();
        if (i !== pageIndex) showPage(i);
      });
      bar.append(pill);
    });
    stage.append(bar);
  }

  /** Hinweis auf Seiten mit "requires": "ha", solange Home Assistant nicht verbunden ist. */
  function updateNotice() {
    if (!notice) return;
    const status = Sx.get('ha.status');
    const connected = Sx.num('ha.connected') === 1;
    notice.hidden = connected || status === undefined;
    if (notice.hidden) return;
    const title = status === 'Token ungültig' ? 'Home Assistant hat den Zugriffstoken abgelehnt.'
      : status === 'nicht eingerichtet' ? 'Home Assistant ist noch nicht eingerichtet.'
        : 'Keine Verbindung zu Home Assistant.';
    const html = `<b>${Sx.esc(title)}</b><span>Rechtsklick auf das Sensorium-Symbol unten rechts → „Home Assistant verbinden …“</span>`;
    if (notice._html !== html) { notice._html = html; notice.innerHTML = html; }
  }

  /** Automatischer Seitenwechsel, z. B. zur PC-Seite, sobald ein Spiel startet. Nur beim Wechsel von „nein“ auf „ja“. */
  function checkAutoPage() {
    (profile.autoPage || []).forEach((rule, i) => {
      const now = Sx.cond(rule.when), was = ruleState.get(i);
      ruleState.set(i, now);
      if (!now || was !== false) return;
      const target = typeof rule.page === 'number' ? rule.page : pages.findIndex((pg, k) => pageId(pg, k) === String(rule.page));
      if (target >= 0 && target < pages.length && target !== pageIndex) showPage(target);
    });
  }

  function toast(message) {
    if (!toastBox || !toastBox.isConnected) {
      toastBox = document.createElement('div');
      toastBox.className = 'ptoast';
      stage.append(toastBox);
    }
    toastBox.textContent = message;
    void toastBox.offsetWidth;
    toastBox.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastBox) toastBox.classList.remove('show'); }, 4000);
  }

  function fit() {
    const scale = Math.min(innerWidth / size.w, innerHeight / size.h);
    const x = (innerWidth - size.w * scale) / 2, y = (innerHeight - size.h * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  function showError(message) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  Sx.on('profile', m => {
    errorBox.hidden = true;
    try { build(m.profile); }
    catch (e) { console.error(e); showError('Das Profil enthält einen Fehler: ' + e.message); }
  });
  Sx.on('error', m => showError(m.message));
  Sx.on('toast', m => toast(m.message));
  Sx.on('catalog', () => { if (profile) Widgets.update(); });
  Sx.on('values', () => {
    overlay.classList.add('gone');
    if (!profile) return;
    checkShownPages();
    checkAutoPage();
    Widgets.update();
    updateNotice();
  });
  addEventListener('resize', fit);
  // Mausrad über dem Panel blättert durch die Seiten.
  addEventListener('wheel', e => {
    const shown = shownPages();
    if (shown.length < 2 || Math.abs(e.deltaY) < 1) return;
    const now = Date.now();
    if (now - lastWheel < 600) return;
    lastWheel = now;
    const at = Math.max(0, shown.indexOf(pageIndex)), next = (at + (e.deltaY > 0 ? 1 : -1) + shown.length) % shown.length;
    showPage(shown[next]);
  }, { passive: true });

  if (Demo.active) Demo.start();
  Sx.post({ type: 'ready', page: 'panel' });
  // Lebenszeichen für den Wächter im Programm (baut die Anzeige neu auf, wenn es ausbleibt).
  setInterval(() => Sx.post({ type: 'heartbeat' }), 5000);
})();
