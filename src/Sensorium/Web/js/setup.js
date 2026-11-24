'use strict';
/*
 * Sensorium – Einrichtungsassistent: Bildschirm wählen, Sensoren prüfen, Home Assistant verbinden (freiwillig)
 * und daraus eine Seite „Zuhause“ zusammenstellen – mit Live-Vorschau. Zum Schluss Autostart und Editor.
 */
(() => {
  const $ = s => document.querySelector(s);
  const view = $('#su-view');
  const KEY = 'sensorium.setup';
  const STEPS = [
    { id: 'welcome', title: 'Willkommen', sub: 'Worum es geht' },
    { id: 'screen', title: 'Bildschirm', sub: 'Wo das Panel läuft' },
    { id: 'look', title: 'Look', sub: 'Farben und Format' },
    { id: 'sensors', title: 'Sensoren', sub: 'Was gemessen wird' },
    { id: 'ha', title: 'Home Assistant', sub: 'Freiwillig' },
    { id: 'done', title: 'Fertig', sub: 'Autostart und Editor' },
  ];
  const su = {
    step: 0, state: null, profile: null,
    ha: 'ask', form: { url: '', token: '' }, test: null, testing: false,
    dir: null, dirById: new Map(), dirError: null, sel: null, saving: false, savedPage: null, haUsed: null,
    templates: null, tplApplied: null, pending: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Date.now() - saved.time < 15 * 60000) su.step = saved.step || 0; // nach Neustart mit Adminrechten weiter
  } catch { /* egal */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ time: Date.now(), step: su.step })); } catch { /* egal */ } };

  // ---------------------------------------------------------------- Hilfen
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const ICON = {
    pulse: '<path d="M3 13h4l2.5-6 5 12 2.5-6h4"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V19h12V9.5"/><path d="M10 19v-5h4v5"/>',
    brush: '<path d="M14.5 4.5l5 5L11 18H6v-5z"/><path d="M12.5 6.5l5 5"/>',
    no: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  };
  const svg = name => `<svg viewBox="0 0 24 24">${ICON[name]}</svg>`;
  function toast(message) {
    const t = $('#su-toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 3800);
  }
  const short = (t, n = 22) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const fmt = (key, unit, dec = 0) => { const v = Sx.num(key); return v == null ? '–' : Sx.fmt(v, dec) + (unit ? ' ' + unit : ''); };

  // Nachrichten ans Programm; ohne Programm (Browser) antwortet eine kleine Simulation.
  function send(msg) { if (Sx.isHost) Sx.post(msg); else simulate(msg); }

  // ---------------------------------------------------------------- Rahmen
  function renderRail() {
    const ol = $('#su-steps');
    ol.textContent = '';
    STEPS.forEach((s, i) => ol.append(h('li', { class: i === su.step ? 'on' : i < su.step ? 'done' : '' },
      h('span', { class: 'num', text: i < su.step ? '✓' : String(i + 1) }),
      h('div', null, h('div', { class: 't1', text: s.title }), h('div', { class: 't2', text: s.sub })))));
    $('#su-ver').textContent = su.state ? `Version ${su.state.version}` : '';
  }
  let footer = {};
  function render() {
    renderRail();
    view.textContent = '';
    const box = h('div', { class: 'anim' });
    view.append(box);
    footer = ({ welcome, screen, look, sensors, ha, done })[STEPS[su.step].id](box) || {};
    const back = $('#su-back'), next = $('#su-next'), skip = $('#su-skip');
    back.style.visibility = footer.hideBack || su.step === 0 ? 'hidden' : '';
    next.textContent = footer.nextLabel || 'Weiter';
    next.disabled = !!footer.nextDisabled;
    next.hidden = !!footer.hideNext;
    skip.hidden = su.step === STEPS.length - 1;
    view.scrollTop = 0;
    refreshLive();
  }
  function go(step) { su.step = Math.max(0, Math.min(STEPS.length - 1, step)); persist(); render(); }
  $('#su-next').addEventListener('click', () => (footer.onNext ? footer.onNext() : go(su.step + 1)));
  $('#su-back').addEventListener('click', () => (footer.onBack ? footer.onBack() : go(su.step - 1)));
  $('#su-skip').addEventListener('click', finish);
  function finish() {
    try { localStorage.removeItem(KEY); } catch { /* egal */ }
    if (!Sx.isHost) { toast('Fertig (Vorschau im Browser).'); return; }
    send({ type: 'finish' });
  }

  // ---------------------------------------------------------------- 1. Willkommen
  function welcome(box) {
    box.append(
      h('div', { class: 'hero' },
        h('div', { class: 'hero-logo', html: '<svg viewBox="0 0 64 64"><path d="M11 35h10l6-14 9 25 6-15h11"/></svg>' }),
        h('div', null, h('h1', { class: 'su', text: 'Willkommen bei Sensorium' }),
          h('p', { class: 'lead', style: 'margin:0', text: 'Sensorium zeigt die Werte deines PCs live auf einem zweiten Bildschirm: Temperaturen, Auslastung, Lüfter, Laufwerke, Netzwerk und die Framerate im Spiel. Auf Wunsch kommt dein Zuhause aus Home Assistant dazu.' }))),
      h('div', { class: 'features' },
        feature('pulse', 'Live-Werte', 'Prozessor, Grafikkarte, Arbeitsspeicher, Laufwerke, Kühlung und FPS – jede Sekunde neu.'),
        feature('home', 'Home Assistant', 'Wetter, Energie, Heizung, wer zuhause ist und Geräte zum Schalten. Ganz freiwillig.'),
        feature('brush', 'Dein eigener Look', 'Im Editor ziehst du Karten und Werte mit der Maus zurecht – ohne eine Zeile Code.')),
      h('p', { class: 'hint', text: 'Die Einrichtung dauert zwei Minuten. Alles lässt sich später ändern.' }));
    return { nextLabel: 'Los geht’s', hideBack: true };
  }
  const feature = (icon, title, text) => h('div', { class: 'feature' }, h('div', { class: 'fi', html: svg(icon) }), h('h3', { text: title }), h('p', { text: text }));

  // ---------------------------------------------------------------- 2. Bildschirm
  function screen(box) {
    box.append(h('h1', { class: 'su', text: 'Auf welchem Bildschirm soll das Panel laufen?' }),
      h('p', { class: 'lead', text: 'Klicke einen Bildschirm an – das Panel zieht sofort dorthin. Am besten eignet sich ein kleiner Zusatzbildschirm, zum Beispiel einer mit 1920 × 1080.' }));
    const st = su.state;
    if (!st) { box.append(h('p', { class: 'note2', text: 'Bildschirme werden ermittelt …' })); return {}; }
    const list = st.screens || [];
    const minX = Math.min(...list.map(s => s.x)), minY = Math.min(...list.map(s => s.y));
    const maxX = Math.max(...list.map(s => s.x + s.w)), maxY = Math.max(...list.map(s => s.y + s.h));
    const area = h('div', { class: 'screens' });
    box.append(area);
    const W = Math.min(820, view.clientWidth - 120 || 820), H = 290;
    const k = Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1)) * 0.96;
    const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
    for (const s of list) {
      area.append(h('div', {
        class: 'scr' + (s.selected ? ' sel' : ''), title: `${s.name} · ${s.w} × ${s.h}`,
        style: `left:${ox + (s.x - minX) * k + 3}px;top:${oy + (s.y - minY) * k + 3}px;width:${s.w * k - 6}px;height:${s.h * k - 6}px`,
        onclick: () => { for (const x of list) x.selected = x === s; render(); send({ type: 'setScreen', id: s.id }); },
      }, h('span', { class: 'check', text: '✓' }), h('span', { class: 'nr', text: String(s.nr) }), h('span', { class: 'res', text: `${s.w} × ${s.h}` }),
        s.primary ? h('span', { class: 'tag', text: 'Hauptbildschirm' }) : null));
    }
    box.append(h('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
      h('button', { class: 'ghost small', text: 'Nummern auf den Bildschirmen zeigen', onclick: () => send({ type: 'identifyScreens' }) }),
      h('span', { class: 'note2', text: list.length < 2 ? 'Nur ein Bildschirm gefunden: Das Panel füllt ihn. Doppelklick auf das Symbol unten rechts blendet es ein und aus.' : 'Das Panel passt sich jeder Auflösung an.' })));
    return {};
  }

  // ---------------------------------------------------------------- 3. Look (Theme) und Format (Vorlage)
  const canvasOf = p => ({ w: (p && p.canvas && p.canvas.width) || 1920, h: (p && p.canvas && p.canvas.height) || 1080 });
  const sizeText = p => { const c = canvasOf(p); return `${c.w} × ${c.h}`; };
  function selectedScreen() { const st = su.state; return (st && (st.screens || []).find(x => x.selected)) || null; }
  /** Passt eine Layout-Vorlage deutlich besser zum Panel-Bildschirm als das jetzige Layout? */
  function suggestTemplate() {
    const scr = selectedScreen();
    if (!scr || !Array.isArray(su.templates) || !su.profile) return null;
    const score = (w, h) => Math.abs(Math.log((scr.w / scr.h) / (w / h))) + 0.5 * Math.abs(Math.log(scr.w / w));
    let best = null, bestScore = Infinity;
    for (const t of su.templates) {
      const m = /(\d+)\s*×\s*(\d+)/.exec(t.format || '');
      if (!m) continue;
      const v = score(+m[1], +m[2]);
      if (v < bestScore) { bestScore = v; best = Object.assign({ w: +m[1], h: +m[2] }, t); }
    }
    const cur = canvasOf(su.profile);
    if (!best || (best.w === cur.w && best.h === cur.h) || score(cur.w, cur.h) - bestScore < 0.15) return null;
    return Object.assign(best, { screen: scr });
  }
  async function applyTemplate(t) {
    let tpl;
    try { tpl = await (await fetch('../Profiles/vorlagen/' + t.file, { cache: 'no-store' })).json(); }
    catch { toast('Die Vorlage ließ sich nicht laden.'); return; }
    const cur = su.profile || {};
    const same = sizeText(tpl) === sizeText(cur);
    const ids = new Set((tpl.pages || []).map(p => p.id));
    const keep = same ? (cur.pages || []).filter(p => !ids.has(p.id)) : [];
    const doc = JSON.parse(JSON.stringify(tpl));
    doc.name = cur.name || tpl.name;
    doc.theme = JSON.parse(JSON.stringify(cur.theme || tpl.theme || {}));
    doc.formulas = Object.assign({}, cur.formulas || {}, tpl.formulas || {});
    doc.pages = [...(tpl.pages || []), ...keep];
    delete doc.description;
    su.profile = doc;
    su.tplApplied = t.name;
    saveNow('template');
    render();
    toast(`Vorlage „${t.name}“ übernommen – das Panel zeigt sie gleich.`);
  }
  let lookTimer = 0;
  function chooseLook(id) {
    if (!su.profile || !Themes.apply(su.profile, id)) return;
    render();
    clearTimeout(lookTimer);
    lookTimer = setTimeout(() => saveNow('look'), 350);
  }
  /** Speichert das Profil sofort (mit Sicherung der vorigen Fassung); das Panel zeigt die Änderung gleich. */
  function saveNow(kind) {
    su.pending = kind;
    send({ type: 'saveProfile', json: Sx.toJson(su.profile) + '\n' });
  }
  function look(box) {
    box.append(h('h1', { class: 'su', text: 'Wie soll dein Panel aussehen?' }),
      h('p', { class: 'lead', text: 'Such dir einen Look aus. Er ändert Farben und Hintergrund, die Anordnung bleibt. Das Panel übernimmt die Wahl sofort, im Editor lässt sich später alles feiner einstellen.' }));
    if (!su.profile) { box.append(h('p', { class: 'note2', text: 'Lade das Profil …' })); return {}; }
    const sug = suggestTemplate();
    if (sug) {
      const others = (su.profile.pages || []).length > 1;
      box.append(h('div', { class: 'tplsug' },
        h('img', { src: '../Profiles/vorlagen/' + sug.image, alt: '' }),
        h('div', null,
          h('h3', { text: `Passende Vorlage für deinen Bildschirm: ${sug.name}` }),
          h('p', { text: `Dein Panel-Bildschirm hat ${sug.screen.w} × ${sug.screen.h}. Das jetzige Layout ist für ${sizeText(su.profile)} gebaut und würde nur verkleinert. Die Vorlage „${sug.name}“ (${sug.format}) ist dafür gemacht.` +
            (others ? ' Seiten in anderem Format (z. B. „Zuhause“) fallen dabei weg; die bisherige Fassung bleibt als Sicherung.' : '') }),
          h('button', { class: 'primary small', text: 'Vorlage übernehmen', onclick: () => applyTemplate(sug) }))));
    } else if (su.tplApplied) {
      box.append(h('p', { class: 'result ok', style: 'margin:-8px 0 18px', text: `Vorlage „${su.tplApplied}“ (${sizeText(su.profile)}) ist übernommen.` }));
    }
    const current = Themes.match(su.profile.theme);
    const list = h('div', { class: 'looks2' });
    for (const p of Themes.list) {
      list.append(h('button', { class: 'look2' + (p.id === current ? ' on' : ''), onclick: () => chooseLook(p.id) },
        h('div', { class: 'sw' }, Themes.swatch(p.id)),
        h('div', null, h('h3', { text: p.name }), h('p', { text: p.text })),
        h('span', { class: 'tick', text: '✓' })));
    }
    const right = h('div', { class: 'preview' });
    box.append(h('div', { class: 'build' }, h('div', { class: 'bcol' }, list), right));
    right.append(h('div', { class: 'pv-head' }, h('span', { class: 'dot2' }), 'Vorschau mit Live-Werten'));
    const pv = h('div', { class: 'pv-wrap' }, h('div', { id: 'stage' }));
    right.append(pv, h('p', { class: 'note2', style: 'margin-top:10px', text: current ? 'Die Vorschau zeigt die erste Seite deines Panels.' : 'Gerade sind eigene Farben eingestellt. Ein Klick auf einen Look ersetzt sie.' }));
    requestAnimationFrame(() => renderStage(pv, ((su.profile.pages || [])[0] || {}).widgets || []));
    return {};
  }

  // ---------------------------------------------------------------- 4. Sensoren
  function sensors(box) {
    box.append(h('h1', { class: 'su', text: 'Was Sensorium messen kann' }),
      h('p', { class: 'lead', text: 'Hier siehst du, was schon klappt. Grün ist bereit, Gelb lässt sich mit einem Klick beheben. Nichts davon ist Pflicht.' }));
    const st = su.state || {};
    const card = (kind, title, text, ...actions) => h('div', { class: 'scard ' + kind },
      h('div', { class: 'si', text: kind === 'ok' ? '✓' : kind === 'warn' ? '!' : 'i' }),
      h('div', { class: 'sb' }, h('h3', { text: title }), h('p', { text: text }), actions.length ? h('div', { class: 'act' }, actions) : null));
    box.append(h('div', { class: 'cards' },
      st.elevated
        ? card('ok', 'Adminrechte', 'Sensorium läuft mit Adminrechten und kommt an alle Sensoren.')
        : card('warn', 'Adminrechte fehlen', 'Für Laufwerkstemperaturen und viele Sensoren auf dem Mainboard braucht Sensorium Adminrechte. Windows fragt beim Neustart einmal nach.',
          h('button', { class: 'ghost small', text: 'Mit Adminrechten neu starten', onclick: () => { persist(); send({ type: 'restartElevated' }); } })),
      st.pawnio
        ? card('ok', 'PawnIO-Treiber', 'Installiert: CPU-Temperatur, Takt und Leistung sowie die Lüfter am Mainboard sind verfügbar.')
        : card('warn', 'PawnIO-Treiber fehlt', 'Ohne diesen kleinen Treiber fehlen CPU-Temperatur, -Takt und -Leistung sowie die Lüfter am Mainboard. Nach der Installation Sensorium einmal neu starten.',
          h('button', { class: 'ghost small', text: 'PawnIO herunterladen', onclick: () => send({ type: 'openPawnIo' }) })),
      st.rtss
        ? card('ok', 'Framerate', 'RivaTuner Statistics Server ist da: Beim Spielen zeigt das Panel die FPS.')
        : card('info', 'Framerate (optional)', 'Für die FPS im Spiel braucht Sensorium den RivaTuner Statistics Server, der zum Beispiel mit MSI Afterburner kommt. Er muss beim Spielen laufen.'),
      st.cooler
        ? card('ok', 'Wasserkühlung', `Erkannt: ${st.cooler}. Pumpe, Lüfter und Kühlmittel kommen direkt per USB.`)
        : card('info', 'Kühlung', 'Keine unterstützte AIO-Wasserkühlung gefunden. Die Lüfter kommen vom Mainboard.')));
    box.append(h('div', { class: 'live' },
      live('CPU', 'cpu.temp', '°C'), live('Grafikkarte', 'gpu.temp', '°C'), live('CPU-Last', 'cpu.load', '%'), live('Arbeitsspeicher', 'sys.ram.pct', '%')));
    return {};
  }
  const live = (label, key, unit) => h('div', { class: 'lv' }, h('div', { class: 'k', text: label }), h('div', { class: 'v', 'data-live': key, 'data-unit': unit, text: '–' }));
  function refreshLive() {
    for (const el of document.querySelectorAll('[data-live]')) {
      const t = fmt(el.dataset.live, el.dataset.unit);
      if (el.textContent !== t) el.textContent = t;
    }
  }

  // ---------------------------------------------------------------- 5. Home Assistant
  function ha(box) {
    const st = su.state || { ha: {} };
    if (su.ha === 'ask') {
      const configured = st.ha && st.ha.url && st.ha.hasToken;
      box.append(h('h1', { class: 'su', text: configured ? 'Home Assistant ist schon verbunden' : 'Nutzt du Home Assistant?' }),
        h('p', { class: 'lead', text: configured
          ? `Sensorium ist mit ${st.ha.url} verbunden. Du kannst jetzt eine Seite „Zuhause“ zusammenstellen lassen.`
          : 'Dann kann Sensorium eine zweite Seite mit deinem Zuhause zeigen: Wetter, Energie, Heizung, wer zuhause ist und Geräte zum Schalten. Umgeschaltet wird mit einem Klick oder dem Mausrad.' }));
      box.append(h('div', { class: 'choices' },
        h('button', {
          class: 'choice', onclick: () => {
            su.haUsed = true;
            if (configured) { su.ha = 'build'; loadDirectory(null, null); }
            else { su.ha = 'form'; su.form.url = st.ha.url || 'http://homeassistant.local:8123'; }
            render();
          },
        }, h('div', { class: 'ci', html: svg('home') }), h('h3', { text: configured ? 'Seite „Zuhause“ anlegen' : 'Ja, verbinden' }),
          h('p', { text: configured ? 'Sensorium schlägt Geräte vor, du wählst aus und siehst sofort die Vorschau.' : 'Du brauchst die Adresse und einen Zugriffstoken. Wie das geht, steht im nächsten Schritt.' })),
        h('button', { class: 'choice no', onclick: () => { su.haUsed = !!configured; go(su.step + 1); } },
          h('div', { class: 'ci', html: svg('no') }), h('h3', { text: configured ? 'Nein, so lassen' : 'Nein, danke' }),
          h('p', { text: 'Sensorium zeigt dann nur die PC-Werte. Home Assistant lässt sich jederzeit später über das Symbol unten rechts verbinden.' }))));
      return { hideNext: true };
    }
    if (su.ha === 'form') return haForm(box);
    if (su.ha === 'build') return haBuild(box);
    // gespeichert
    box.append(h('h1', { class: 'su', text: 'Die Seite „Zuhause“ ist angelegt' }),
      h('p', { class: 'lead', text: `Das Panel hat jetzt eine zweite Seite${su.savedPage ? ` („${su.savedPage}“)` : ''}. Unten in der Mitte des Panels schaltest du per Klick um, oder mit dem Mausrad. Startet ein Spiel, springt es von selbst zurück zur PC-Seite.` }),
      h('p', { class: 'note2', text: 'Feinschliff – andere Geräte, andere Anordnung, eigene Farben – machst du am besten im Editor.' }));
    return {};
  }

  function haForm(box) {
    box.append(h('h1', { class: 'su', text: 'Home Assistant verbinden' }),
      h('p', { class: 'lead', text: 'Sensorium liest nur die Werte, die du anzeigst. Schalten kann es ausschließlich Geräte, die du später als Kachel zum Schalten freigibst.' }));
    const url = h('input', { type: 'text', value: su.form.url, spellcheck: 'false', placeholder: 'http://homeassistant.local:8123' });
    const token = h('input', { type: 'password', value: su.form.token, spellcheck: 'false', placeholder: 'langlebigen Zugriffstoken einfügen (Strg+V)' });
    const result = h('div', { class: 'result' + (su.test ? (su.test.ok ? ' ok' : ' bad') : ''), text: su.testing ? 'Verbinde …' : su.test ? (su.test.ok ? `Verbunden mit Home Assistant ${su.test.version}.` : su.test.error) : '' });
    const testBtn = h('button', { class: 'ghost small', text: 'Verbindung testen', disabled: su.testing });
    const sync = () => { su.form.url = url.value.trim(); su.form.token = token.value.trim(); };
    url.addEventListener('input', () => { sync(); su.test = null; updateNext(); });
    token.addEventListener('input', () => { sync(); su.test = null; updateNext(); });
    testBtn.addEventListener('click', () => {
      sync();
      if (!su.form.url || !su.form.token) { toast('Bitte Adresse und Token eintragen.'); return; }
      su.testing = true;
      su.test = null;
      render();
      send({ type: 'haTest', url: su.form.url, token: su.form.token });
    });
    box.append(h('div', { class: 'form' },
      h('div', null, h('label', { text: 'Adresse von Home Assistant' }), url, h('label', { text: 'Langlebiger Zugriffstoken' }), token,
        h('div', { style: 'margin-top:16px' }, testBtn), result),
      h('div', { class: 'howto' }, h('h3', { text: 'So bekommst du den Token' }),
        h('ol', null, h('li', { text: 'Öffne Home Assistant im Browser.' }), h('li', { text: 'Links unten auf deinen Namen klicken, dann oben den Reiter „Sicherheit“ öffnen.' }),
          h('li', { text: 'Ganz unten bei „Langlebige Zugriffstoken“ auf „Token erstellen“ klicken.' }),
          h('li', { text: 'Einen Namen eingeben, etwa „Sensorium“, den Token kopieren und hier einfügen.' }),
          h('li', { text: 'Sensorium speichert ihn verschlüsselt – nur dein Windows-Konto kann ihn lesen.' })))));
    function updateNext() { $('#su-next').disabled = !(su.test && su.test.ok); }
    return {
      nextLabel: 'Verbinden und weiter', nextDisabled: !(su.test && su.test.ok),
      onBack: () => { su.ha = 'ask'; render(); },
      onNext: () => { send({ type: 'haConnect', url: su.form.url, token: su.form.token }); su.ha = 'build'; loadDirectory(su.form.url, su.form.token); render(); },
    };
  }

  // ---------------------------------------------------------------- Seite „Zuhause“ zusammenstellen
  function loadDirectory(url, token) {
    su.dir = null;
    su.dirError = null;
    su.sel = null;
    const msg = { type: 'haDirectory' };
    if (url) msg.url = url;
    if (token) msg.token = token;
    send(msg);
  }
  const DOMAIN = id => id.slice(0, id.indexOf('.'));
  const available = e => e.state !== 'unavailable' && e.state !== 'unknown';
  const floorOf = e => e.floor || '';
  // Personen, Wetter und Sonne gehören zu keiner Etage und werden nie herausgefiltert.
  const floorBound = e => !['person', 'weather', 'sun'].includes(DOMAIN(e.id));
  function candidates() {
    const s = su.sel, all = su.dir.entities.filter(e => !floorBound(e) || s.floors.has(floorOf(e)));
    const by = pred => all.filter(pred).sort((a, b) => Number(available(b)) - Number(available(a)) || a.name.localeCompare(b.name, 'de'));
    const num = e => { const v = parseFloat(e.state); return isFinite(v) ? (e.unit === 'kW' ? v * 1000 : v) : -1; };
    return {
      weather: by(e => DOMAIN(e.id) === 'weather'),
      persons: by(e => DOMAIN(e.id) === 'person'),
      lock: by(e => DOMAIN(e.id) === 'lock'),
      openings: by(e => DOMAIN(e.id) === 'binary_sensor' && ['window', 'door', 'opening', 'garage_door'].includes(e.dc)),
      climate: by(e => DOMAIN(e.id) === 'climate'),
      temp: by(e => DOMAIN(e.id) === 'sensor' && e.dc === 'temperature'),
      hum: by(e => DOMAIN(e.id) === 'sensor' && e.dc === 'humidity'),
      power: by(e => DOMAIN(e.id) === 'sensor' && e.dc === 'power' && /^k?W$/.test(e.unit || '')).sort((a, b) => num(b) - num(a)),
      energy: by(e => DOMAIN(e.id) === 'sensor' && e.dc === 'energy'),
      devices: by(e => DOMAIN(e.id) === 'light' || DOMAIN(e.id) === 'switch'),
    };
  }
  function initSelection() {
    su.sel = { floors: new Set([...su.dir.floors, '']), weather: null, persons: new Set(), lock: null, openings: new Set(), climate: new Set(), temp: null, hum: null, power: new Set(), devices: new Set(), plug: null, plugEnergy: null, price: '', tasmota: '' };
    const c = candidates(), s = su.sel, ok = list => list.filter(available);
    s.weather = (c.weather.find(e => e.id === 'weather.forecast_home') || ok(c.weather)[0] || {}).id || null;
    for (const e of ok(c.persons).slice(0, 3)) s.persons.add(e.id);
    s.lock = (ok(c.lock)[0] || {}).id || null;
    for (const e of ok(c.openings).slice(0, 4)) s.openings.add(e.id);
    for (const e of ok(c.climate).slice(0, 4)) s.climate.add(e.id);
    s.temp = (ok(c.temp)[0] || {}).id || null;
    s.hum = (ok(c.hum)[0] || {}).id || null;
    const plug = ok(c.power).find(e => /(^|[\s_.-])(pc|computer|rechner|gaming)([\s_.-]|$)/i.test(e.name + ' ' + e.id));
    if (plug) { s.plug = plug.id; s.plugEnergy = guessEnergy(plug.id, c.energy); }
    for (const e of ok(c.power).filter(e => e.id !== s.plug).slice(0, 6)) s.power.add(e.id);
    for (const e of ok(c.devices).filter(e => DOMAIN(e.id) === 'light').slice(0, 4)) s.devices.add(e.id);
  }
  function guessEnergy(plugId, energies) {
    const base = plugId.replace(/^sensor\./, '').replace(/_(energy_)?(power|leistung)$/, '');
    const hit = energies.find(e => e.id.startsWith('sensor.' + base) && /today|heute/i.test(e.id + e.name));
    return hit ? hit.id : null;
  }
  /** Nach dem Abwählen einer Etage: Auswahl auf das beschränken, was noch passt. */
  function pruneSelection() {
    const c = candidates(), s = su.sel, ids = list => new Set(list.map(e => e.id));
    for (const key of ['openings', 'climate', 'power', 'devices']) { const keep = ids(c[key]); for (const id of [...s[key]]) if (!keep.has(id)) s[key].delete(id); }
    for (const key of ['lock', 'temp', 'hum']) if (s[key] && !ids(c[key]).has(s[key])) s[key] = null;
    if (s.plug && !ids(c.power).has(s.plug)) { s.plug = null; s.plugEnergy = null; }
  }

  function haBuild(box) {
    const cv = canvasOf(su.profile);
    if (cv.w !== 1920 || cv.h !== 1080) {
      box.append(h('h1', { class: 'su', text: 'Home Assistant ist verbunden' }),
        h('p', { class: 'lead', text: `Die automatische Seite „Zuhause“ gibt es bisher nur im Format 1920 × 1080, dein Panel hat ${cv.w} × ${cv.h}. Im Editor findest du unter „Sensoren“ alle Geräte aus Home Assistant und ziehst sie einfach auf eine Seite.` }));
      return { onBack: () => { su.ha = 'ask'; render(); } };
    }
    box.append(h('h1', { class: 'su', text: 'Seite „Zuhause“ zusammenstellen' }),
      h('p', { class: 'lead', text: 'Sensorium hat Vorschläge aus deinem Home Assistant gemacht. Hake an, was auf die Seite soll – rechts siehst du sofort, wie es aussieht.' }));
    if (su.dirError) {
      box.append(h('p', { class: 'result bad', text: 'Die Liste aus Home Assistant ließ sich nicht laden: ' + su.dirError }),
        h('button', { class: 'ghost small', text: 'Noch einmal versuchen', onclick: () => { loadDirectory(su.form.url, su.form.token); render(); } }));
      return { nextLabel: 'Ohne Seite weiter', onBack: () => { su.ha = 'ask'; render(); } };
    }
    if (!su.dir) { box.append(h('p', { class: 'note2', text: 'Lade die Geräte aus Home Assistant …' })); return { nextLabel: 'Ohne Seite weiter', onBack: () => { su.ha = 'ask'; render(); } }; }
    if (!su.sel) initSelection();
    const c = candidates(), s = su.sel;
    const left = h('div', { class: 'bcol' }), right = h('div', { class: 'preview' });
    box.append(h('div', { class: 'build' }, left, right));

    if (su.dir.floors.length) {
      const floors = h('div', { class: 'floors' });
      for (const f of [...su.dir.floors, '']) {
        floors.append(h('button', {
          class: 'chip2' + (s.floors.has(f) ? ' on' : ''), text: f || 'ohne Etage',
          onclick: () => { if (s.floors.has(f)) s.floors.delete(f); else s.floors.add(f); pruneSelection(); render(); },
        }));
      }
      left.append(h('div', { class: 'note2', text: 'Welche Etagen gehören zu deinem Zuhause?' }), floors);
    }
    const state = e => (e.state === 'unavailable' ? 'nicht erreichbar' : e.state === 'unknown' ? 'unbekannt' : Sx.de(isFinite(parseFloat(e.state)) && e.unit ? `${e.state} ${e.unit}` : e.state));
    const radio = (title, key, list, none = 'keins', open = false) => section(title, list.length, s[key] ? 1 : 0, open, [
      option('radio', none, '', s[key] == null, () => { s[key] = null; changed(); }, key),
      ...list.map(e => option('radio', e.name, state(e), s[key] === e.id, () => { s[key] = e.id; if (key === 'plug') s.plugEnergy = guessEnergy(e.id, c.energy); changed(); }, key, !available(e))),
    ]);
    const multi = (title, key, list, max, open = false) => section(title, list.length, s[key].size, open, list.map(e =>
      option('checkbox', e.name, state(e), s[key].has(e.id), on => { if (on) { if (s[key].size >= max) { toast(`Höchstens ${max}.`); render(); return; } s[key].add(e.id); } else s[key].delete(e.id); changed(); }, key, !available(e))));
    left.append(
      radio('Wetter', 'weather', c.weather, 'kein Wetter', true),
      multi('Personen', 'persons', c.persons, 4),
      radio('Haustür', 'lock', c.lock, 'kein Türschloss'),
      multi('Fenster und Türen', 'openings', c.openings, 8),
      multi('Heizungen', 'climate', c.climate, 7),
      radio('Raumtemperatur', 'temp', c.temp, 'keine'),
      radio('Luftfeuchte', 'hum', c.hum, 'keine'),
      multi('Verbraucher (Leistung)', 'power', c.power, 10),
      multi('Geräte zum Schalten', 'devices', c.devices, 12),
      plugSection(c, radio));

    right.append(h('div', { class: 'pv-head' }, h('span', { class: 'dot2' }), 'Vorschau mit Live-Werten'));
    const pv = h('div', { class: 'pv-wrap' }, h('div', { id: 'stage' }));
    right.append(pv, h('p', { class: 'note2', style: 'margin-top:10px', text: 'Neu ausgewählte Werte erscheinen nach ein bis zwei Sekunden.' }));
    requestAnimationFrame(() => renderPreview(pv));
    return {
      nextLabel: su.saving ? 'Speichere …' : 'Seite anlegen', nextDisabled: su.saving,
      onNext: savePage,
      onBack: () => { su.ha = su.state && su.state.ha && su.state.ha.hasToken && !su.form.token ? 'ask' : 'form'; render(); },
    };
  }
  function plugSection(c, radio) {
    const s = su.sel;
    const sec = radio('PC an der Steckdose', 'plug', c.power, 'keine Steckdose');
    const opts = sec.querySelector('.opts');
    if (s.plug) {
      const energy = h('select', { style: 'width:100%;height:34px;border-radius:8px;border:1px solid var(--s-line2);background:#0a1019;padding:0 8px' });
      energy.append(h('option', { value: '', text: 'Verbrauch heute: keiner' }));
      for (const e of c.energy) energy.append(h('option', { value: e.id, text: `Verbrauch heute: ${e.name}` }));
      energy.value = s.plugEnergy || '';
      energy.addEventListener('change', () => { s.plugEnergy = energy.value || null; changed(false); });
      const price = h('input', { type: 'text', value: s.price, placeholder: 'Strompreis in Cent je kWh, z. B. 31,5', spellcheck: 'false' });
      price.addEventListener('change', () => { s.price = price.value.trim(); changed(false); });
      const ip = h('input', { type: 'text', value: s.tasmota, placeholder: 'optional: IP einer Tasmota-Steckdose (Werte jede Sekunde)', spellcheck: 'false' });
      ip.addEventListener('change', () => { s.tasmota = ip.value.trim(); changed(false); });
      opts.prepend(h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin:4px 0 10px' }, energy, price, ip,
        h('div', { class: 'note2', text: 'Dann zeigt die PC-Seite den echten Verbrauch des ganzen PCs statt nur CPU und Grafikkarte.' })));
    }
    return sec;
  }
  function section(title, total, chosen, open, items) {
    const d = h('details', { class: 'sec' }, h('summary', null, title, h('span', { class: 'cnt', text: total ? `${chosen} von ${total}` : 'nichts gefunden' })),
      h('div', { class: 'opts' }, total ? items : h('div', { class: 'note2', text: 'In Home Assistant nichts Passendes gefunden.' })));
    d.open = open || openSections.has(title);
    d.addEventListener('toggle', () => { if (d.open) openSections.add(title); else openSections.delete(title); });
    return d;
  }
  const openSections = new Set();
  function option(type, name, extra, checked, onChange, group, na) {
    const input = h('input', { type, name: group });
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'opt' + (na ? ' na' : '') }, input, h('span', { class: 'on', text: name, title: name }), extra ? h('span', { class: 'os', text: short(extra, 18) }) : null);
  }
  let changeTimer = 0;
  function changed(full = true) {
    if (full) render(); else renderPreview($('.pv-wrap'));
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => { const { page, formulas } = generate(); send({ type: 'draftRefs', json: JSON.stringify({ formulas, pages: [page] }) }); }, 600);
  }

  /** Baut die Seite aus der Auswahl. Liefert { page, formulas }. */
  function generate() {
    const s = su.sel, byId = su.dirById, formulas = {};
    const name = id => (byId.get(id) || {}).name || id;
    const strip = t => String(t).replace(/^(heizung|thermostat|klima|heizkörper)\s+/i, '');
    const W = (su.profile && su.profile.canvas && su.profile.canvas.width) || 1920;
    const right = W - 24;

    // Zeile 1: Uhr · Wetter · Zuhause
    const row1 = [];
    const clock = {
      type: 'card', w: 480, h: 150, children: [
        { type: 'clock', show: 'time', x: 28, y: 12, w: 270, h: 100, size: 94 },
        { type: 'clock', show: 'date', x: 32, y: 114, w: 300, h: 24 }],
    };
    if (byId.has('sun.sun')) clock.children.push(
      { type: 'group', x: 0, y: 0, w: 480, h: 150, visibleIf: { sensor: 'ha:sun.sun', eq: 'above_horizon' }, children: [
        { type: 'label', text: 'Sonnenuntergang', x: 252, y: 28, w: 200, h: 14, align: 'right' },
        { type: 'text', text: '{ha:sun.sun@next_setting|clock}', x: 232, y: 46, w: 220, h: 32, size: 24, font: 'num', weight: 300, color: '@text', align: 'right' }] },
      { type: 'group', x: 0, y: 0, w: 480, h: 150, hiddenIf: { sensor: 'ha:sun.sun', eq: 'above_horizon' }, children: [
        { type: 'label', text: 'Sonnenaufgang', x: 252, y: 28, w: 200, h: 14, align: 'right' },
        { type: 'text', text: '{ha:sun.sun@next_rising|clock}', x: 232, y: 46, w: 220, h: 32, size: 24, font: 'num', weight: 300, color: '@text', align: 'right' }] });
    const persons = [...s.persons], checks = [];
    if (s.lock && persons.length) checks.push({ when: [{ sensor: `ha:${s.lock}`, eq: 'unlocked' }, ...persons.map(p => ({ sensor: `ha:${p}`, ne: 'home' }))], level: 'crit', text: 'Haustür offen, niemand da' });
    for (const o of [...s.openings].slice(0, 6)) checks.push({ sensor: `ha:${o}`, is: 'on', text: short(name(o), 22) + ' offen' });
    clock.children.push({ type: 'status', x: 152, y: 88, w: 300, h: 22, align: 'right', checks, okText: 'Alles in Ordnung' });
    row1.push(clock);
    const rows = [];
    if (s.lock) rows.push({ label: short(name(s.lock), 16), icon: 'lock', sensor: `ha:${s.lock}#state`, icons: { unlocked: 'unlock', open: 'unlock' },
      map: { locked: ['Abgeschlossen', '@ok'], unlocked: ['Aufgeschlossen', '@warn'], open: ['Offen', '@warn'], jammed: ['Blockiert', '@crit'], unavailable: ['nicht erreichbar', null] } });
    if (s.openings.size) rows.push({ label: 'Fenster', icon: 'window', active: 'on', activeText: '{names} offen', idleText: 'Alle zu',
      group: [...s.openings].slice(0, 8).map(o => ({ sensor: `ha:${o}`, name: short(name(o), 14) })) });
    const people = persons.slice(0, rows.length ? 3 : 4);
    // Viele Personen plus Tür und Fenster brauchen Platz: dann zeigt das Wetter keine Vorhersage.
    const compactWeather = people.length >= 3 && rows.length > 0;
    if (s.weather) row1.push({ type: 'card', w: compactWeather ? 340 : 540, h: 150, label: 'Wetter', meta: compactWeather ? undefined : short(name(s.weather), 32), children: compactWeather
      ? [{ type: 'weather', entity: s.weather, x: 24, y: 54, w: 300, h: 90 }]
      : [{ type: 'weather', entity: s.weather, x: 24, y: 54, w: 300, h: 90 },
        { type: 'box', x: 340, y: 62, w: 1, h: 64, fill: '@line' },
        { type: 'forecast', entity: s.weather, days: 3, x: 352, y: 58, w: 170, h: 80 }] });
    if (people.length || rows.length) row1.push({ type: 'card', h: 150, label: 'Zuhause', _people: people, _rows: rows, children: [] });
    let x = 24;
    row1.forEach((card, i) => {
      card.x = x; card.y = 24;
      if (i === row1.length - 1) card.w = right - x;
      x += card.w + 20;
      if (card._rows) {
        const kids = card.children;
        let sx = 28;
        if (card._people.length) {
          kids.push({ type: 'people', x: 28, y: 66, w: card._people.length * 175, h: 50, items: card._people.map(p => ({ name: short(name(p), 12), sensor: `ha:${p}` })) });
          sx = 28 + card._people.length * 175 + 4;
          if (card._rows.length) kids.push({ type: 'box', x: sx, y: 58, w: 1, h: 72, fill: '@line' });
          sx += 26;
        }
        if (card._rows.length) kids.push({ type: 'states', x: sx, y: 58, w: Math.max(220, card.w - sx - 28), h: 72, rows: card._rows });
        delete card._people; delete card._rows;
      }
    });

    // Die Höhen richten sich nach der Zahl der Geräte: ohne Geräte reichen Energie und Raumklima bis nach unten,
    // mit bis zu sechs Geräten gibt es eine Kachelreihe, mit mehr zwei.
    const H = (su.profile && su.profile.canvas && su.profile.canvas.height) || 1080;
    const bottom = H - 24;
    const devices = [...s.devices].slice(0, 12);
    const lines = !devices.length ? 0 : devices.length > 6 ? 2 : 1;
    const row3H = lines ? 64 + lines * 103 + (lines - 1) * 12 + 20 : 0;
    const row2H = (lines ? bottom - row3H - 20 : bottom) - 194;

    // Zeile 2: Energie · Raumklima (eine Karte allein bekommt die ganze Breite)
    const row2 = [];
    const power = [...s.power].filter(p => p !== s.plug);
    const climate = [...s.climate];
    const hasEnergy = power.length > 0 || !!s.plug, hasClimate = !!(s.temp || s.hum || climate.length);
    const cardW = hasEnergy && hasClimate ? 926 : right - 24, inner = cardW - 56;
    if (hasEnergy) {
      const items = [];
      if (s.plug) items.push({ label: 'PC', sensor: 'pc.wall', tag: 'dieser PC' });
      for (const p of power) items.push({ label: short(name(p), 26), sensor: `ha:${p}` });
      const columns = cardW > 1200 ? 3 : 2, want = Math.ceil(items.length / columns);
      const kids = [];
      let top = 72, rowsCount;
      if (items.length >= 2) {
        // Platz für Verlauf und Liste: der Verlauf wächst mit, wenn die Karte höher ist.
        const free = row2H - 306;
        rowsCount = Math.min(want, Math.max(1, Math.floor((free - 96) / 46)));
        const sparkH = Math.max(96, Math.min(360, free - rowsCount * 46));
        formulas['zuhause.verbraucher'] = { label: 'Verbraucher zusammen', expr: 'sum(' + power.map(p => `{ha:${p}}`).concat(s.plug ? ['pc.wall'] : []).join(', ') + ')' };
        kids.push(
          { type: 'label', text: 'Verbraucher zusammen', x: 28, y: 72, w: 400, h: 14 },
          { type: 'value', sensor: 'zuhause.verbraucher', unit: 'W', x: 28, y: 88, w: 400, h: 92, size: 84, unitSize: 26, unitGap: 8 },
          { type: 'text', text: 'Verlauf 10 min', x: 30, y: 182, w: 400, h: 20, size: 15 },
          { type: 'spark', sensor: 'zuhause.verbraucher', every: 10, x: 28, y: 214, w: inner, h: sparkH, color: '@accent', grid: true, fill: 0.26 },
          { type: 'box', x: 28, y: 214 + sparkH + 24, w: inner, h: 1, fill: '@line' });
        top = 214 + sparkH + 46;
      } else {
        rowsCount = Math.max(1, Math.min(want, Math.floor((row2H - 118) / 46)));
      }
      kids.push({ type: 'label', text: 'Verbraucher jetzt', x: 28, y: top, w: 300, h: 14 },
        { type: 'consumers', x: 28, y: top + 28, w: inner, h: rowsCount * 46, columns, rows: rowsCount, gap: 50, items });
      const card = { type: 'card', w: cardW, h: row2H, label: 'Energie', children: kids };
      if (formulasPrice()) card.meta = 'Strompreis {strom.preis.ct:2} ct/kWh';
      row2.push(card);
    }
    if (hasClimate) {
      const kids = [];
      let y = 72;
      if (s.temp || s.hum) {
        if (s.temp) kids.push({ type: 'label', text: short(name(s.temp), 30), x: 28, y: 72, w: 290, h: 14 },
          { type: 'value', sensor: `ha:${s.temp}`, unit: '°C', decimals: 1, x: 28, y: 88, w: 290, h: 92, size: 84, unitSize: 26, unitGap: 8 });
        if (s.hum) {
          const hx = s.temp ? 356 : 28;
          if (s.temp) kids.push({ type: 'box', x: 330, y: 72, w: 1, h: 150, fill: '@line' });
          kids.push({ type: 'label', text: short(name(s.hum), 30), x: hx, y: 72, w: 260, h: 14 },
            { type: 'value', sensor: `ha:${s.hum}`, unit: '%', x: hx, y: 88, w: 260, h: 92, size: 84, unitSize: 26, unitGap: 8, rules: [{ from: 0, color: '@warn-text' }, { from: 40, color: '@text' }, { from: 60.5, color: '@warn-text' }] },
            { type: 'range', sensor: `ha:${s.hum}`, min: 0, max: 100, from: 40, to: 60, text: 'Wohlfühlbereich 40–60 %', x: hx, y: 194, w: 250, h: 30 });
        }
        y = 262;
      }
      if (climate.length) {
        const max = Math.max(1, Math.min(7, Math.floor((row2H - 18 - y - 28) / 58)));
        kids.push({ type: 'label', text: 'Heizung', x: 28, y, w: 300, h: 14 },
          { type: 'climate', x: 28, y: y + 28, w: Math.min(inner, 870), h: Math.min(max, climate.length) * 58, rows: climate.slice(0, max).map(id => ({ label: short(strip(name(id)), 24), entity: id })) });
      }
      row2.push({ type: 'card', w: cardW, h: row2H, label: 'Raumklima', children: kids });
    }
    row2.forEach((card, i) => { card.x = 24 + i * 946; card.y = 194; });

    // Zeile 3: Geräte zum Schalten, über die ganze Breite
    const row3 = [];
    if (lines) {
      const cols = Math.ceil(devices.length / lines), cw = right - 24;
      const tw = Math.min(450, Math.floor((cw - 40 - (cols - 1) * 12) / cols));
      row3.push({
        type: 'card', x: 24, y: (row2.length ? 194 + row2H + 20 : bottom - row3H), w: cw, h: row3H, label: 'Geräte', meta: 'Klick schaltet',
        children: devices.map((id, i) => ({
          type: 'tile', label: short(name(id), 24), icon: id.startsWith('light.') ? 'bulb' : 'plug', kind: id.startsWith('light.') ? 'light' : 'device',
          entity: id, toggle: true, x: 20 + (i % cols) * (tw + 12), y: 64 + Math.floor(i / cols) * 115, w: tw, h: 103,
        })),
      });
    }

    // PC-Steckdose und Strompreis
    if (s.plug) {
      const ip = /^[A-Za-z0-9][A-Za-z0-9.\-]*$/.test(s.tasmota) ? s.tasmota : '';
      formulas['pc.wall'] = { label: 'PC an der Steckdose', expr: ip ? `first({tasmota:${ip}/power}, {ha:${s.plug}})` : `{ha:${s.plug}}` };
      const today = s.plugEnergy ? `{ha:${s.plugEnergy}}` : '';
      if (ip || today) formulas['pc.wall.today'] = { label: 'PC heute (kWh)', expr: ip && today ? `first({tasmota:${ip}/today}, ${today})` : ip ? `{tasmota:${ip}/today}` : today };
    }
    const price = formulasPrice();
    if (price) formulas['strom.preis.ct'] = { label: 'Strompreis (Cent je kWh)', expr: String(price) };

    return { page: { id: 'zuhause', name: 'Zuhause', short: 'Zuhause', requires: 'ha', widgets: [...row1, ...row2, ...row3] }, formulas };
  }
  function formulasPrice() {
    const p = parseFloat(String(su.sel.price || '').replace(',', '.'));
    return isFinite(p) && p > 0 && p < 1000 ? Math.round(p * 100) / 100 : null;
  }

  function renderPreview(wrap) {
    if (!wrap || !su.sel) return;
    renderStage(wrap, generate().page.widgets, 'Noch nichts ausgewählt');
  }
  /** Zeigt Elemente verkleinert in der Vorschau, mit dem Theme des Profils. */
  function renderStage(wrap, widgets, emptyText) {
    if (!wrap) return;
    const stage = wrap.querySelector('#stage');
    Sx.applyTheme(su.profile && su.profile.theme);
    const W = (su.profile && su.profile.canvas && su.profile.canvas.width) || 1920, H = (su.profile && su.profile.canvas && su.profile.canvas.height) || 1080;
    const scale = (wrap.clientWidth || 640) / W;
    wrap.style.height = Math.round(H * scale) + 'px';
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.transform = `scale(${scale})`;
    Widgets.reset();
    stage.textContent = '';
    for (const w of widgets) Widgets.mount(w, stage);
    if (!widgets.length && emptyText) stage.append(h('div', { style: 'position:absolute;inset:0;display:grid;place-items:center;color:#56657a;font-size:40px', text: emptyText }));
    Widgets.update();
  }

  function savePage() {
    if (su.saving) return;
    const { page, formulas } = generate();
    if (!page.widgets.length) { toast('Wähle zuerst etwas aus.'); return; }
    const profile = JSON.parse(JSON.stringify(su.profile || {}));
    if (!Array.isArray(profile.pages)) profile.pages = [];
    // Eine vorhandene Seite „Zuhause“ wird nie überschrieben: die neue kommt dazu.
    let n = 1;
    while (profile.pages.some(p => p.id === page.id)) { n++; page.id = `zuhause${n}`; page.name = `Zuhause ${n}`; page.short = `Zuhause ${n}`; }
    profile.pages.push(page);
    profile.formulas = Object.assign({}, profile.formulas || {}, formulas);
    su.savedPage = page.name;
    su.saving = true;
    su.pending = 'page';
    render();
    send({ type: 'saveProfile', json: Sx.toJson(profile) + '\n' });
  }

  // ---------------------------------------------------------------- 6. Fertig
  function done(box) {
    const st = su.state || { ha: {} };
    const scr = (st.screens || []).find(s => s.selected);
    const row = (kind, k, v) => h('div', { class: 'srow2 ' + kind }, h('span', { class: 'si', text: kind === 'ok' ? '✓' : kind === 'warn' ? '!' : '–' }), h('span', { class: 'k', text: k }), h('span', { text: v }));
    box.append(h('h1', { class: 'su', text: 'Fertig – viel Spaß mit Sensorium!' }),
      h('p', { class: 'lead', text: 'Das Panel läuft. Hier noch einmal alles im Überblick.' }),
      h('div', { class: 'summary' },
        row('ok', 'Bildschirm', scr ? `Bildschirm ${scr.nr} · ${scr.w} × ${scr.h}` : 'gewählt'),
        row('ok', 'Look', [((Themes.byId.get(Themes.match(su.profile && su.profile.theme)) || {}).name || 'eigene Farben'), su.tplApplied ? `Vorlage „${su.tplApplied}“` : null].filter(Boolean).join(' · ')),
        row(st.elevated && st.pawnio ? 'ok' : 'warn', 'Sensoren', [st.elevated ? 'Adminrechte' : 'ohne Adminrechte', st.pawnio ? 'PawnIO installiert' : 'PawnIO fehlt', st.rtss ? 'FPS über RTSS' : null].filter(Boolean).join(' · ')),
        row(st.ha && st.ha.url && st.ha.hasToken ? 'ok' : 'info', 'Home Assistant', st.ha && st.ha.url && st.ha.hasToken ? `verbunden${su.savedPage ? ` · Seite „${su.savedPage}“ angelegt` : ''}` : 'nicht genutzt')));
    const auto = h('input', { type: 'checkbox' });
    auto.checked = !!st.autostart;
    auto.disabled = !st.canAutostart;
    auto.addEventListener('change', () => send({ type: 'setAutostart', on: auto.checked }));
    box.append(h('label', { class: 'toggle' + (st.canAutostart ? '' : ' disabled'), title: st.canAutostart ? '' : 'Dafür muss Sensorium mit Adminrechten laufen (Schritt „Sensoren“).' },
      auto, h('i'), 'Mit Windows starten'),
      st.canAutostart ? null : h('p', { class: 'note2', style: 'margin-top:6px', text: 'Geht erst, wenn Sensorium mit Adminrechten läuft.' }),
      h('div', { class: 'tips', html:
        '<b>Gut zu wissen:</b> Doppelklick auf das Sensorium-Symbol unten rechts blendet das Panel ein und aus. ' +
        'Ein Rechtsklick öffnet das Menü mit <b>Panel bearbeiten</b> (Editor), <b>Sensoren und Zuordnung</b>, <b>Home Assistant</b> und dieser <b>Einrichtung</b>.' }),
      h('div', { style: 'margin-top:20px' }, h('button', { class: 'ghost', text: 'Panel im Editor anpassen', onclick: () => send({ type: 'openEditor' }) })));
    return { nextLabel: 'Fertig', onNext: finish };
  }

  // ---------------------------------------------------------------- Nachrichten
  Sx.on('setupState', m => { su.state = m; if (['screen', 'look', 'sensors', 'done'].includes(STEPS[su.step].id) || !su.state.version) render(); else renderRail(); });
  Sx.on('profile', m => {
    if (!m.profile) return;
    const first = !su.profile;
    su.profile = m.profile;
    if (first && STEPS[su.step].id === 'look') render();
  });
  Sx.on('haTestResult', m => { su.testing = false; su.test = { ok: !!m.ok, version: m.version, error: m.error || 'Keine Verbindung.' }; if (su.ha === 'form') render(); });
  Sx.on('haDirectory', m => {
    if (m.error) { su.dirError = m.error; su.dir = null; }
    else {
      su.dir = { entities: m.entities || [], floors: m.floors || [] };
      su.dirById = new Map(su.dir.entities.map(e => [e.id, e]));
    }
    if (su.ha === 'build') { render(); if (su.dir) changed(false); }
  });
  Sx.on('saved', () => {
    const what = su.pending;
    su.pending = null;
    if (what !== 'page' || !su.saving) return;
    su.saving = false;
    su.ha = 'saved';
    send({ type: 'setupState' });
    render();
  });
  Sx.on('toast', m => { su.saving = false; toast(m.message); if (su.ha === 'build') render(); });
  // Vorschau: Formeln der neuen Seite gibt es im Programm erst nach dem Speichern – bis dahin rechnet der Assistent selbst.
  Sx.derive(v => {
    if (su.ha !== 'build' || !su.sel) return;
    const s = su.sel, n = x => (typeof x === 'number' && isFinite(x) ? x : null);
    const ip = /^[A-Za-z0-9][A-Za-z0-9.\-]*$/.test(s.tasmota || '') ? s.tasmota : '';
    if (s.plug && n(v['pc.wall']) == null) v['pc.wall'] = n(ip ? v[`tasmota:${ip}/power`] : null) ?? n(v[`ha:${s.plug}`]);
    if (n(v['zuhause.verbraucher']) == null) {
      const parts = [...s.power].filter(p => p !== s.plug).map(p => n(v[`ha:${p}`]));
      if (s.plug) parts.push(n(v['pc.wall']));
      const nums = parts.filter(x => x != null);
      if (nums.length) v['zuhause.verbraucher'] = nums.reduce((a, b) => a + b, 0);
    }
  });
  Sx.on('values', () => { refreshLive(); if (document.querySelector('.pv-wrap')) Widgets.update(); });
  Sx.on('catalog', () => { if (STEPS[su.step].id === 'sensors') send({ type: 'setupState' }); });

  // ---------------------------------------------------------------- Simulation im Browser (ohne Programm)
  function simulate(msg) {
    const reply = m => setTimeout(() => Sx.emit(m), 250);
    switch (msg.type) {
      case 'setupState':
        reply({ type: 'setupState', version: '0.2.0', elevated: true, pawnio: false, rtss: true, cooler: null, autostart: false, canAutostart: true,
          screens: [{ nr: 1, id: 'A', name: 'DISPLAY1', x: 0, y: 0, w: 2560, h: 1440, primary: true, selected: false }, { nr: 2, id: 'B', name: 'DISPLAY2', x: 2560, y: 360, w: 1920, h: 1080, primary: false, selected: true }],
          ha: { url: null, hasToken: false, connected: false, status: 'nicht eingerichtet' } });
        break;
      case 'haTest':
        setTimeout(() => Sx.emit({ type: 'haTestResult', ok: true, version: '2026.11.2' }), 700);
        break;
      case 'haDirectory': {
        const e = (id, name, state, extra = {}) => Object.assign({ id, name, state }, extra);
        reply({ type: 'haDirectory', floors: ['Erdgeschoss', 'Obergeschoss'], entities: [
          e('sun.sun', 'Sonne', 'above_horizon'), e('weather.forecast_home', 'Zuhause', 'sunny'),
          e('person.alex', 'Alex', 'home'), e('person.sam', 'Sam', 'not_home'),
          e('lock.haustuer', 'Haustür', 'locked', { floor: 'Erdgeschoss', area: 'Flur' }),
          e('binary_sensor.fenster_bad', 'Fenster Bad', 'off', { dc: 'window', floor: 'Obergeschoss' }),
          e('binary_sensor.fenster_kueche', 'Fenster Küche', 'on', { dc: 'window', floor: 'Erdgeschoss' }),
          e('climate.wohnzimmer', 'Heizung Wohnzimmer', 'heat', { floor: 'Erdgeschoss' }), e('climate.bad', 'Heizung Bad', 'heat', { floor: 'Obergeschoss' }),
          e('climate.kueche', 'Heizung Küche', 'off', { floor: 'Erdgeschoss' }),
          e('sensor.buero_temperatur', 'Büro Temperatur', '19.7', { dc: 'temperature', unit: '°C', floor: 'Obergeschoss' }),
          e('sensor.buero_luftfeuchte', 'Büro Luftfeuchte', '48.3', { dc: 'humidity', unit: '%', floor: 'Obergeschoss' }),
          e('sensor.pc_steckdose_leistung', 'PC Steckdose Leistung', '160', { dc: 'power', unit: 'W', floor: 'Obergeschoss' }),
          e('sensor.pc_steckdose_heute', 'PC Steckdose Energie heute', '0.27', { dc: 'energy', unit: 'kWh', floor: 'Obergeschoss' }),
          e('sensor.schreibtisch_leistung', 'Schreibtisch', '90', { dc: 'power', unit: 'W', floor: 'Obergeschoss' }),
          e('sensor.netzwerk_leistung', 'Netzwerk', '80', { dc: 'power', unit: 'W', floor: 'Erdgeschoss' }),
          e('sensor.kuehlschrank_leistung', 'Kühlschrank', '1', { dc: 'power', unit: 'W', floor: 'Erdgeschoss' }),
          e('sensor.fernseher_leistung', 'Fernseher', '0', { dc: 'power', unit: 'W', floor: 'Erdgeschoss' }),
          e('light.schreibtisch', 'Schreibtisch-LED', 'on', { floor: 'Obergeschoss' }), e('light.regal', 'Regal-LED', 'off', { floor: 'Obergeschoss' }),
          e('switch.kaffeemaschine', 'Kaffeemaschine', 'off', { floor: 'Erdgeschoss' }),
        ] });
        break;
      }
      case 'saveProfile': setTimeout(() => Sx.emit({ type: 'saved', path: 'profiles/standard.json' }), 400); break;
      case 'setScreen': case 'draftRefs': case 'haConnect': break;
      default: toast(`(Vorschau) ${msg.type}`);
    }
  }

  // ---------------------------------------------------------------- Start
  render();
  if (Demo.active) Demo.start();
  if (!Sx.isHost) {
    fetch('../Profiles/standard.json').then(r => r.json()).then(p => { if (!su.profile) Sx.emit({ type: 'profile', profile: p }); }).catch(() => { /* egal */ });
  }
  fetch('../Profiles/vorlagen/index.json', { cache: 'no-store' }).then(r => r.json())
    .then(list => { su.templates = list; if (STEPS[su.step].id === 'look') render(); }).catch(() => { /* ohne Vorlagen */ });
  Sx.post({ type: 'ready', page: 'setup' });
  send({ type: 'setupState' });
  setInterval(() => Sx.post({ type: 'heartbeat' }), 5000);
})();
