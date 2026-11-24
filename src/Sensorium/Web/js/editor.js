'use strict';
/*
 * Sensorium – Editor: Seiten, Karten und Elemente mit der Maus gestalten, Sensoren und Home-Assistant-Werte
 * zuordnen, Formeln, Bedingungen und Design ändern. Die Fläche benutzt dieselben Bausteine wie das Panel
 * und zeigt Live-Werte. Gespeichert wird das ganze Profil (als eigenes Profil in %APPDATA%\Sensorium).
 */
(() => {
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), wrap = $('#ed-wrap'), canvas = $('#ed-canvas'), ov = $('#ed-ov');
  const DRAFT_KEY = 'sensorium.editor.draft', FLOOR_KEY = 'sensorium.editor.hiddenFloors';

  // ---------------------------------------------------------------- Symbole
  const EI = {
    card: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.5h17"/>',
    group: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.6"/>',
    header: '<path d="M5.5 6v12"/><path d="M9.5 8h9M9.5 12h6M9.5 16h8"/>',
    text: '<path d="M5 6h14M12 6v13"/>',
    label: '<path d="M4 9h11M4 14h7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    value: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h15.5M4 15h15.5"/>',
    stat: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h5M8 14.5h8"/>',
    kv: '<path d="M4 8.5h7M15 8.5h5M4 15.5h7M15 15.5h5"/>',
    metric: '<path d="M4 7h8M16 7h4"/><path d="M4 18l4-4 3 2 5-6 4 3"/>',
    spark: '<path d="M3 17l4-5 4 3 4-7 6 5"/>',
    gauge: '<path d="M5.5 17.5a8 8 0 1 1 13 0"/><path d="M12 13.5l3.5-4"/>',
    ring: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" stroke-width="3"/>',
    bar: '<rect x="3" y="9.5" width="18" height="5" rx="2.5"/><path d="M5.5 12h8"/>',
    threads: '<path d="M6 19v-5M10 19v-9M14 19v-6M18 19V8"/>',
    drive: '<rect x="3.5" y="7" width="17" height="10" rx="2"/><path d="M7 12h6M16.5 12h.01"/>',
    status: '<circle cx="7" cy="12" r="2.5"/><path d="M12 12h8"/>',
    box: '<path d="M12 3.5v17"/>',
    star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.6 14.4a4.5 4.5 0 0 1 5 4.6"/>',
    states: '<circle cx="6" cy="8" r="1.6"/><circle cx="6" cy="16" r="1.6"/><path d="M10 8h9M10 16h9"/>',
    state: '<circle cx="7" cy="12" r="2.2"/><path d="M11 12h9"/>',
    range: '<path d="M3 12h18"/><path d="M9 8v8M15 8v8"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    caret: '<path d="M9 6l6 6-6 6"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    parent: '<path d="M10 15l-5-5 5-5"/><path d="M5 10h9a5 5 0 0 1 5 5v4"/>',
    pick: '<path d="M4 20l5-5M13.5 6.5l4 4M15.5 4.5a2.8 2.8 0 0 1 4 4l-8 8-5 1 1-5z"/>',
  };
  function svg(name, cls = '') {
    const path = EI[name];
    if (path) return `<svg viewBox="0 0 24 24" class="${cls}">${path}</svg>`;
    const el = Widgets.icon(name, 20); // Symbole des Panels (bolt, plug, flame …)
    if (cls) el.setAttribute('class', cls);
    return el.outerHTML;
  }

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
  const clone = v => JSON.parse(JSON.stringify(v));
  const samePath = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  const lastOf = p => p[p.length - 1];
  const parseNum = t => { const s = String(t).trim().replace(',', '.'); if (s === '') return undefined; const n = Number(s); return isFinite(n) ? n : null; };
  const isContainer = n => !!n && (n.type === 'card' || n.type === 'group');
  const plain = s => String(s || '').replace(/\{[^{}]*\}/g, '…').trim();

  function toast(message) {
    const t = $('#ed-toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 3800);
  }
  function banner(text, buttons) {
    const b = $('#ed-banner');
    b.textContent = '';
    b.append(h('span', { text }));
    for (const [label, fn] of buttons || []) b.append(h('button', { class: 'mini', text: label, onclick: () => { b.hidden = true; fn(); } }));
    b.append(h('button', { class: 'icon-btn', html: svg('close'), title: 'Schließen', onclick: () => { b.hidden = true; } }));
    b.hidden = false;
  }

  // ---------------------------------------------------------------- Bausteine: Namen, Symbole, Vorgaben
  const TYPES = {
    card: { name: 'Karte', icon: 'card', group: 'Aufbau', def: { w: 600, h: 300, label: 'Neue Karte', children: [] } },
    group: { name: 'Gruppe', icon: 'group', group: 'Aufbau', def: { w: 300, h: 150, children: [] } },
    header: { name: 'Überschrift', icon: 'header', group: 'Aufbau', def: { text: 'Überschrift', w: 300, h: 14 } },
    label: { name: 'Beschriftung', icon: 'label', group: 'Aufbau', def: { text: 'Beschriftung', w: 200, h: 14 } },
    text: { name: 'Text', icon: 'text', group: 'Aufbau', def: { text: 'Text', w: 300, h: 22, size: 15 } },
    box: { name: 'Linie', icon: 'box', group: 'Aufbau', def: { w: 1, h: 60, fill: '@line' } },
    icon: { name: 'Symbol', icon: 'star', group: 'Aufbau', def: { name: 'bolt', size: 24, w: 24, h: 24, color: '@accent' } },
    clock: { name: 'Uhr', icon: 'clock', group: 'Aufbau', def: { show: 'time', w: 270, h: 100, size: 94 } },
    value: { name: 'Wert', icon: 'value', group: 'Werte', def: { sensor: '', unit: '', w: 220, h: 80, size: 64 } },
    stat: { name: 'Kennzahl', icon: 'stat', group: 'Werte', def: { label: 'Wert', sensor: '', unit: '', w: 110, h: 60 } },
    kv: { name: 'Zeile', icon: 'kv', group: 'Werte', def: { label: 'Bezeichnung', sensor: '', unit: '', w: 320, h: 34 } },
    metric: { name: 'Messzeile', icon: 'metric', group: 'Werte', def: { label: 'Messwert', sensor: '', unit: '', max: 100, w: 466, h: 80 } },
    spark: { name: 'Verlauf', icon: 'spark', group: 'Werte', def: { sensor: '', w: 300, h: 70, grid: true, fill: 0.24 } },
    gauge: { name: 'Bogen', icon: 'gauge', group: 'Werte', def: { sensor: '', label: 'Temperatur', unit: '°C', min: 20, max: 100, w: 380, h: 330 } },
    ring: { name: 'Ring', icon: 'ring', group: 'Werte', def: { sensor: '', label: 'Belegt', w: 180, h: 180 } },
    bar: { name: 'Balken', icon: 'bar', group: 'Werte', def: { sensor: '', max: 100, w: 400, h: 10 } },
    threads: { name: 'Kern-Raster', icon: 'threads', group: 'Werte', def: { sensor: 'cpu.threads', warnAt: 85, w: 870, h: 38 } },
    drive: { name: 'Laufwerk', icon: 'drive', group: 'Werte', def: { letter: 'C', w: 564, h: 100 } },
    fanlist: { name: 'Lüfterliste', icon: 'fan', group: 'Werte', def: { w: 572, h: 218, columns: 2, max: 6, hideZero: true, maxRpm: 3000 } },
    status: { name: 'Ampel', icon: 'status', group: 'Werte', def: { w: 280, h: 22, align: 'right', checks: [], okText: 'Alles normal' } },
    weather: { name: 'Wetter', icon: 'partly', group: 'Home Assistant', def: { entity: '', w: 300, h: 90 } },
    forecast: { name: 'Vorhersage', icon: 'calendar', group: 'Home Assistant', def: { entity: '', days: 3, w: 170, h: 80 } },
    people: { name: 'Personen', icon: 'people', group: 'Home Assistant', def: { items: [], w: 360, h: 50 } },
    states: { name: 'Zustände', icon: 'states', group: 'Home Assistant', def: { rows: [], w: 358, h: 72 } },
    state: { name: 'Zustand', icon: 'state', group: 'Home Assistant', def: { sensor: '', size: 20, w: 300, h: 30 } },
    consumers: { name: 'Verbraucher', icon: 'plug', group: 'Home Assistant', def: { items: [], columns: 2, rows: 3, gap: 50, w: 870, h: 140 } },
    climate: { name: 'Heizungen', icon: 'flame', group: 'Home Assistant', def: { rows: [], w: 870, h: 232 } },
    range: { name: 'Wohlfühlbereich', icon: 'range', group: 'Home Assistant', def: { sensor: '', min: 0, max: 100, from: 40, to: 60, text: 'Wohlfühlbereich 40–60 %', w: 250, h: 30 } },
    tile: { name: 'Gerätekachel', icon: 'bulb', group: 'Home Assistant', def: { label: 'Licht', icon: 'bulb', entity: '', toggle: true, w: 280, h: 103 } },
  };
  const typeName = n => (TYPES[n.type] || { name: n.type }).name;
  const typeIcon = n => (TYPES[n.type] || { icon: 'card' }).icon;

  // ---------------------------------------------------------------- Eigenschaften je Baustein
  const ALIGN = [['', 'links'], ['center', 'Mitte'], ['right', 'rechts']];
  const ALIGN2 = [['', 'links'], ['right', 'rechts']];
  const FONTS = [['', 'Standard'], ['num', 'Zahlen (Bahnschrift)'], ['ui', 'Text (Segoe UI)']];
  const WEIGHTS = [['', 'normal'], ['300', 'leicht'], ['600', 'fett']];
  const FORMATS = [['', 'Zahl'], ['rate', 'Datenrate (B/s)'], ['size', 'Größe (Bytes)']];
  const RULE_FIELDS = [['from', 'ab Wert', 'num'], ['color', 'Farbe', 'color'], ['pulse', 'pulsieren', 'bool']];
  const FIELDS = {
    card: [['label', 'Überschrift', 'text'], ['color', 'Farbe Überschrift', 'color'], ['meta', 'Zusatz rechts', 'tpl'], ['title', 'Titel', 'tpl'], ['chips', 'Chips (je Zeile)', 'strlist'], ['divider', 'Trennlinie bei y', 'num'], ['background', 'Hintergrund (CSS)', 'text']],
    group: [],
    header: [['text', 'Text', 'text'], ['color', 'Farbe', 'color']],
    label: [['text', 'Text', 'tpl'], ['icon', 'Symbol', 'icon'], ['color', 'Farbe', 'color'], ['align', 'Ausrichtung', 'select', ALIGN2]],
    text: [['text', 'Text', 'tpl'], ['size', 'Schriftgröße', 'num'], ['color', 'Farbe', 'color'], ['align', 'Ausrichtung', 'select', ALIGN], ['font', 'Schriftart', 'select', FONTS], ['weight', 'Schriftstärke', 'select', WEIGHTS], ['emph', 'Werte hervorheben', 'bool']],
    box: [['fill', 'Farbe', 'color'], ['radius', 'Rundung', 'num']],
    icon: [['name', 'Symbol', 'icon'], ['size', 'Größe', 'num'], ['color', 'Farbe', 'color']],
    clock: [['show', 'Anzeige', 'select', [['time', 'Uhrzeit'], ['date', 'Datum']]], ['size', 'Schriftgröße', 'num'], ['seconds', 'mit Sekunden', 'bool'], ['format', 'Datum', 'select', [['', 'ausgeschrieben'], ['short', 'kurz']]], ['color', 'Farbe', 'color'], ['align', 'Ausrichtung', 'select', ALIGN]],
    value: [['sensor', 'Wert', 'sensor'], ['unit', 'Einheit', 'text'], ['decimals', 'Nachkommastellen', 'num'], ['scale', 'Faktor', 'num'], ['abs', 'ohne Vorzeichen', 'bool'], ['format', 'Format', 'select', FORMATS], ['size', 'Schriftgröße', 'num'], ['unitSize', 'Größe Einheit', 'num'], ['unitGap', 'Abstand Einheit', 'num'], ['align', 'Ausrichtung', 'select', ALIGN], ['color', 'Farbe', 'color'], ['rules', 'Farbregeln', 'rules']],
    stat: [['label', 'Beschriftung', 'text'], ['sensor', 'Wert', 'sensor'], ['text', 'oder Text', 'tpl'], ['unit', 'Einheit', 'text'], ['decimals', 'Nachkommastellen', 'num'], ['size', 'Schriftgröße', 'num'], ['align', 'Ausrichtung', 'select', ALIGN], ['color', 'Farbe', 'color'], ['rules', 'Farbregeln', 'rules']],
    kv: [['label', 'Bezeichnung', 'text'], ['sensor', 'Wert', 'sensor'], ['text', 'oder Text', 'tpl'], ['unit', 'Einheit', 'text'], ['decimals', 'Nachkommastellen', 'num'], ['size', 'Schriftgröße', 'num']],
    metric: [['label', 'Beschriftung', 'text'], ['sensor', 'Wert', 'sensor'], ['unit', 'Einheit', 'text'], ['decimals', 'Nachkommastellen', 'num'], ['scale', 'Faktor', 'num'], ['max', 'Maximum der Kurve', 'numOrSensor'], ['format', 'Format', 'select', FORMATS], ['color', 'Farbe', 'color'], ['rules', 'Farbregeln', 'rules'], ['badge', 'Plakette (JSON)', 'json']],
    spark: [['sensor', 'Wert', 'sensor'], ['color', 'Farbe', 'color'], ['max', 'Maximum', 'numOrSensor'], ['min', 'Minimum („auto“ = auch negativ)', 'text'], ['every', 'Nur jeden n-ten Wert', 'num'], ['grid', 'Rasterlinien', 'bool'], ['fill', 'Füllung (0 bis 1)', 'num'], ['stroke', 'Linienstärke', 'num']],
    gauge: [['sensor', 'Wert', 'sensor'], ['label', 'Beschriftung', 'text'], ['unit', 'Einheit', 'text'], ['min', 'Minimum', 'num'], ['max', 'Maximum', 'num'], ['decimals', 'Nachkommastellen', 'num'], ['color', 'Farbe', 'color'], ['ticks', 'Skala', 'bool', true], ['minmax', 'Min/Max anzeigen', 'bool', true], ['rules', 'Farbregeln', 'rules']],
    ring: [['sensor', 'Wert', 'sensor'], ['label', 'Beschriftung', 'text'], ['unit', 'Einheit', 'text'], ['max', 'Maximum', 'numOrSensor'], ['decimals', 'Nachkommastellen', 'num'], ['color', 'Farbe', 'color']],
    bar: [['sensor', 'Wert', 'sensor'], ['max', 'Maximum', 'numOrSensor'], ['marker', 'Markierung bei', 'numOrSensor'], ['color', 'Farbe', 'color'], ['rules', 'Farbregeln', 'rules']],
    threads: [['sensor', 'Liste der Werte', 'sensor'], ['warnAt', 'Warnfarbe ab %', 'num']],
    drive: [['letter', 'Laufwerksbuchstabe', 'text'], ['sub', 'Untertitel', 'tpl']],
    fanlist: [['columns', 'Spalten', 'num'], ['max', 'höchstens', 'num'], ['hideZero', 'stehende Lüfter ausblenden', 'bool'], ['maxRpm', 'RPM für vollen Balken', 'num'], ['temps', 'Kühlmittel zeigen', 'bool', true]],
    status: [['checks', 'Prüfungen (JSON)', 'json'], ['okText', 'Text, wenn alles gut', 'text'], ['activeIf', 'Aktiv, wenn (JSON)', 'json'], ['activeText', 'Text, wenn aktiv', 'text'], ['align', 'Ausrichtung', 'select', ALIGN2]],
    weather: [['entity', 'Wetter', 'entity', ['weather']], ['size', 'Schriftgröße', 'num'], ['iconSize', 'Symbolgröße', 'num']],
    forecast: [['entity', 'Wetter', 'entity', ['weather']], ['days', 'Tage', 'num']],
    people: [['items', 'Personen', 'list', [['name', 'Name', 'text'], ['sensor', 'Person', 'sensor']]]],
    states: [['rows', 'Zeilen (JSON)', 'json'], ['rowHeight', 'Zeilenhöhe', 'num'], ['gap', 'Abstand', 'num']],
    state: [['sensor', 'Wert', 'sensor'], ['map', 'Übersetzung (JSON)', 'json'], ['empty', 'Text ohne Wert', 'text'], ['size', 'Schriftgröße', 'num'], ['font', 'Schriftart', 'select', FONTS], ['weight', 'Schriftstärke', 'select', WEIGHTS]],
    consumers: [['items', 'Verbraucher', 'list', [['label', 'Name', 'text'], ['tag', 'Markierung', 'text'], ['sensor', 'Leistung', 'sensor']]], ['columns', 'Spalten', 'num'], ['rows', 'Zeilen', 'num'], ['gap', 'Spaltenabstand', 'num'], ['idleBelow', 'grau unter (W)', 'num']],
    climate: [['rows', 'Heizungen', 'list', [['label', 'Raum', 'text'], ['entity', 'Thermostat', 'entity', ['climate']], ['window', 'Fenster', 'sensor'], ['sensor', 'Ersatz-Temperatur', 'sensor']]], ['rowHeight', 'Zeilenhöhe', 'num']],
    range: [['sensor', 'Wert', 'sensor'], ['min', 'Minimum', 'num'], ['max', 'Maximum', 'num'], ['from', 'gut ab', 'num'], ['to', 'gut bis', 'num'], ['text', 'Text', 'text']],
    tile: [['label', 'Name', 'text'], ['icon', 'Symbol', 'icon'], ['entity', 'Gerät', 'entity', ['light', 'switch', 'fan', 'input_boolean', 'binary_sensor', 'sensor']], ['toggle', 'Klick schaltet um', 'bool'], ['kind', 'Art', 'select', [['', 'automatisch'], ['light', 'Licht'], ['device', 'Gerät']]], ['sensor', 'oder Wert', 'sensor'], ['onIf', 'An, wenn (JSON)', 'json'], ['onText', 'Text an', 'text'], ['offText', 'Text aus', 'text'], ['subOn', 'Zusatz, wenn an', 'tpl'], ['subOff', 'Zusatz, wenn aus', 'tpl']],
  };
  const THEME_COLORS = [
    ['', 'Standard'], ['@accent', 'Akzent'], ['@accent2', 'Akzent 2'], ['@up', 'Violett'], ['@ok', 'Grün'], ['@warn', 'Warnung'], ['@crit', 'Kritisch'],
    ['@text', 'Text'], ['@muted', 'Gedämpft'], ['@dim', 'Dunkel'], ['@line', 'Linie'], ['@ok-text', 'Grün (Text)'], ['@warn-text', 'Gelb (Text)'], ['@crit-text', 'Rot (Text)'],
  ];
  const OPS = [['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['eq', '='], ['ne', '≠'], ['in', 'ist eins von'], ['exists', 'vorhanden']];

  // ---------------------------------------------------------------- Zustand
  const ed = {
    doc: null, path: '', page: 0, sel: null,
    snap: '', saved: '', past: [], future: [], dirty: false,
    scale: 1, zoom: 'fit', grid: 4, showAll: false,
    clip: null, open: new Set(), tab: 'sensors', bottomMin: false,
    dir: null, dirById: new Map(), dirLoading: false, results: new Map(),
    elByCfg: new Map(), treeRows: [], lists: new Set(), guides: [],
  };
  const W = () => (ed.doc && ed.doc.canvas && ed.doc.canvas.width) || 1920;
  const H = () => (ed.doc && ed.doc.canvas && ed.doc.canvas.height) || 1080;
  const curPage = () => ed.doc.pages[ed.page];
  function pageWidgets() { const p = curPage(); return p.widgets || (p.widgets = []); }
  function nodeAt(path) {
    if (!path) return null;
    let list = pageWidgets(), node = null;
    for (const i of path) { node = list[i]; if (!node) return null; list = node.children || []; }
    return node;
  }
  function parentList(path) {
    if (path.length === 1) return pageWidgets();
    const parent = nodeAt(path.slice(0, -1));
    return parent.children || (parent.children = []);
  }
  const parentOf = path => (path.length > 1 ? nodeAt(path.slice(0, -1)) : null);
  function sizeOf(node) {
    const el = ed.elByCfg.get(node);
    return { w: node.w ?? (el ? el.offsetWidth : 0), h: node.h ?? (el ? el.offsetHeight : 0) };
  }
  function absRect(path) {
    let x = 0, y = 0, list = pageWidgets(), node = null;
    for (const i of path) { node = list[i]; x += node.x || 0; y += node.y || 0; list = node.children || []; }
    const s = sizeOf(node);
    return { x, y, w: s.w, h: s.h };
  }
  function visible(n) { return (!n.visibleIf || Sx.cond(n.visibleIf)) && !(n.hiddenIf && Sx.cond(n.hiddenIf)); }
  function forcedPath(path) { return !!ed.sel && path.length <= ed.sel.length && path.every((x, i) => x === ed.sel[i]); }

  // ---------------------------------------------------------------- Laden, Rückgängig, Speichern
  function normalize(profile) {
    const doc = clone(profile);
    if (!Array.isArray(doc.pages) || !doc.pages.length) {
      doc.pages = [{ id: 'seite1', name: 'Seite 1', widgets: doc.widgets || [] }];
      delete doc.widgets;
    }
    doc.canvas = doc.canvas || { width: 1920, height: 1080 };
    doc.theme = doc.theme || {};
    return doc;
  }
  function load(profile, path) {
    ed.doc = normalize(profile);
    ed.path = path || '';
    ed.snap = JSON.stringify(ed.doc);
    ed.saved = ed.snap;
    ed.past = [];
    ed.future = [];
    ed.page = Math.min(ed.page, ed.doc.pages.length - 1);
    if (ed.sel && !nodeAt(ed.sel)) ed.sel = null;
    setDirty(false);
    applyTheme();
    renderAll();
  }
  function setDirty(dirty) {
    if (ed.dirty !== dirty) Sx.post({ type: 'dirty', value: dirty });
    ed.dirty = dirty;
    const st = $('#ed-state');
    st.textContent = dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert';
    st.classList.toggle('dirty', dirty);
  }
  /** Nach jeder Änderung: Verlauf, Darstellung, Entwurf. */
  function commit(opts = {}) {
    const now = JSON.stringify(ed.doc);
    if (now === ed.snap) { if (!opts.keepInspector) renderInspector(); return; }
    ed.past.push(ed.snap);
    if (ed.past.length > 150) ed.past.shift();
    ed.future = [];
    ed.snap = now;
    setDirty(now !== ed.saved);
    storeDraft();
    renderCanvas();
    renderTree();
    renderPages();
    if (!opts.keepInspector) renderInspector();
    if (opts.bottom) renderBottom();
    updateButtons();
    scheduleRefs();
  }
  function restore(json) {
    ed.doc = JSON.parse(json);
    ed.snap = json;
    if (ed.page >= ed.doc.pages.length) ed.page = ed.doc.pages.length - 1;
    if (ed.sel && !nodeAt(ed.sel)) ed.sel = null;
    setDirty(json !== ed.saved);
    storeDraft();
    applyTheme();
    renderAll();
    scheduleRefs();
  }
  function undo() { if (!ed.past.length) return; ed.future.push(ed.snap); restore(ed.past.pop()); }
  function redo() { if (!ed.future.length) return; ed.past.push(ed.snap); restore(ed.future.pop()); }
  function updateButtons() {
    $('#ed-undo').disabled = !ed.past.length;
    $('#ed-redo').disabled = !ed.future.length;
  }
  function storeDraft() {
    try {
      if (ed.dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ time: Date.now(), json: ed.snap }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch { /* ohne Speicher eben nicht */ }
  }
  function checkDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { d = null; }
    if (!d || !d.json || d.json === ed.saved) return;
    const when = new Date(d.time).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    banner(`Es gibt einen ungespeicherten Entwurf (${when}).`, [
      ['Wiederherstellen', () => { ed.past.push(ed.snap); restore(d.json); }],
      ['Verwerfen', () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* egal */ } }],
    ]);
  }

  /** JSON wie von Hand geschrieben: kurze Objekte (ein Element) in einer Zeile. */
  function toJson(v, ind = '') {
    const inner = ind + '  ';
    const flatArray = a => a.every(x => x === null || typeof x !== 'object');
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (flatArray(v)) return '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
      return '[\n' + v.map(x => inner + toJson(x, inner)).join(',\n') + '\n' + ind + ']';
    }
    if (v && typeof v === 'object') {
      const keys = Object.keys(v).filter(k => v[k] !== undefined);
      if (!keys.length) return '{}';
      const flat = keys.every(k => v[k] === null || typeof v[k] !== 'object' || (Array.isArray(v[k]) && flatArray(v[k])));
      if (flat) {
        const line = '{ ' + keys.map(k => JSON.stringify(k) + ': ' + toJson(v[k], inner)).join(', ') + ' }';
        if (line.length <= 180) return line;
      }
      return '{\n' + keys.map(k => inner + JSON.stringify(k) + ': ' + toJson(v[k], inner)).join(',\n') + '\n' + ind + '}';
    }
    return JSON.stringify(v);
  }
  function save() {
    if (!Sx.isHost) { toast('Speichern geht nur im Sensorium-Programm.'); return; }
    Sx.post({ type: 'saveProfile', json: toJson(ed.doc) + '\n' });
  }
  function preview() {
    if (!Sx.isHost) { toast('Die Vorschau geht nur im Sensorium-Programm.'); return; }
    Sx.post({ type: 'previewProfile', json: toJson(ed.doc) });
  }
  // Der Entwurf meldet dem Programm, welche Werte er braucht (neue Home-Assistant-Werte erscheinen sofort).
  let refsTimer = 0;
  function scheduleRefs() {
    clearTimeout(refsTimer);
    refsTimer = setTimeout(() => { if (Sx.isHost && ed.doc) Sx.post({ type: 'draftRefs', json: JSON.stringify(ed.doc) }); }, 700);
  }

  // ---------------------------------------------------------------- Theme
  const DEFAULT_GRADIENTS = { accent: ['#22c3ec', '#6d8cff'], warn: ['#ffd060', '#ff8a3d'], crit: ['#ff8a96', '#ff3d6e'], ok: ['#5ff0b0', '#2bbf8a'], up: ['#b9a6ff', '#8a6cff'] };
  function applyTheme() {
    const t = ed.doc.theme || {};
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(t.colors || {})) root.setProperty('--' + name, value);
    if (t.fonts && t.fonts.num) root.setProperty('--num', t.fonts.num);
    if (t.fonts && t.fonts.ui) root.setProperty('--ui', t.fonts.ui);
    Sx.setTheme(Object.assign({}, t, { gradients: Object.assign({}, DEFAULT_GRADIENTS, t.gradients || {}) }));
    document.body.dataset.bg = t.background || 'aurora';
  }

  // ---------------------------------------------------------------- Fläche
  function renderAll() {
    renderPages();
    renderCanvas();
    renderTree();
    renderInspector();
    renderBottom();
    updateButtons();
  }
  function fitZoom() {
    let s = ed.zoom === 'fit' ? Math.min((canvas.clientWidth - 64) / W(), (canvas.clientHeight - 64) / H()) : +ed.zoom;
    if (!isFinite(s) || s <= 0) s = 0.5;
    ed.scale = Math.max(0.1, Math.min(2, s));
    stage.style.transform = `scale(${ed.scale})`;
    wrap.style.width = Math.round(W() * ed.scale) + 'px';
    wrap.style.height = Math.round(H() * ed.scale) + 'px';
  }
  function renderCanvas() {
    if (!ed.doc) return;
    Widgets.reset();
    stage.textContent = '';
    stage.style.width = W() + 'px';
    stage.style.height = H() + 'px';
    for (const w of pageWidgets()) Widgets.mount(w, stage);
    ed.elByCfg = new Map();
    for (const el of stage.querySelectorAll('.w')) if (el._cfg) ed.elByCfg.set(el._cfg, el);
    fitZoom();
    Widgets.update();
    applyForce();
    drawSelection();
  }
  let liveFrame = 0;
  function liveRender() {
    if (liveFrame) return;
    liveFrame = requestAnimationFrame(() => { liveFrame = 0; renderCanvas(); });
  }
  function applyForce() {
    for (const el of stage.querySelectorAll('.ed-force')) el.classList.remove('ed-force');
    if (!ed.sel) return;
    for (let i = 1; i <= ed.sel.length; i++) {
      const el = ed.elByCfg.get(nodeAt(ed.sel.slice(0, i)));
      if (el) el.classList.add('ed-force');
    }
  }
  function drawSelection() {
    ov.textContent = '';
    const s = ed.scale;
    for (const g of ed.guides) {
      ov.append(h('div', { class: 'guide ' + g.axis, style: g.axis === 'x' ? `left:${g.at * s}px` : `top:${g.at * s}px` }));
    }
    if (!ed.sel || !nodeAt(ed.sel)) return;
    if (ed.sel.length > 1) {
      const p = absRect(ed.sel.slice(0, -1));
      ov.append(h('div', { class: 'par-box', style: `left:${p.x * s}px;top:${p.y * s}px;width:${p.w * s}px;height:${p.h * s}px` }));
    }
    const node = nodeAt(ed.sel), r = absRect(ed.sel);
    const box = h('div', { class: 'sel-box', style: `left:${r.x * s}px;top:${r.y * s}px;width:${Math.max(r.w * s, 2)}px;height:${Math.max(r.h * s, 2)}px` },
      h('span', { class: 'sel-tag', text: typeName(node) }),
      h('span', { class: 'sel-size', text: `${Math.round(r.w)} × ${Math.round(r.h)}  ·  x ${Math.round(node.x || 0)}  y ${Math.round(node.y || 0)}` }));
    for (const hd of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) box.append(h('i', { class: 'hd hd-' + hd, 'data-h': hd }));
    ov.append(box);
  }
  function drawHover(path) {
    const old = ov.querySelector('.hover-box');
    if (old) old.remove();
    if (!path || samePath(path, ed.sel)) return;
    const r = absRect(path), s = ed.scale;
    ov.append(h('div', { class: 'hover-box', style: `left:${r.x * s}px;top:${r.y * s}px;width:${r.w * s}px;height:${r.h * s}px` }));
  }

  function toCanvas(e) {
    const b = wrap.getBoundingClientRect();
    return { x: (e.clientX - b.left) / ed.scale, y: (e.clientY - b.top) / ed.scale };
  }
  /** Element unter dem Mauszeiger: das tiefste sichtbare (Gruppen nur über die Ebenen). */
  function hitTest(p, containersOnly = false) {
    let best = null, depth = -1;
    const pad = 4 / ed.scale;
    const walk = (list, path, ox, oy) => list.forEach((n, i) => {
      const here = path.concat(i);
      if (!(ed.showAll || visible(n) || forcedPath(here))) return;
      const x = ox + (n.x || 0), y = oy + (n.y || 0), s = sizeOf(n);
      const px = s.w < 8 ? pad : 0, py = s.h < 8 ? pad : 0;
      const inside = p.x >= x - px && p.x <= x + s.w + px && p.y >= y - py && p.y <= y + s.h + py;
      if (n.children) walk(n.children, here, x, y);
      if (!inside) return;
      if (containersOnly ? isContainer(n) : n.type !== 'group') {
        if (here.length >= depth) { best = here; depth = here.length; }
      }
    });
    walk(pageWidgets(), [], 0, 0);
    return best;
  }

  // Einrasten: Kanten und Mitten der Nachbarn, Ränder der Karte, Abstand 20 px, sonst Raster.
  function snapLines(path) {
    const parent = parentOf(path), list = parentList(path), idx = lastOf(path);
    const pw = parent ? sizeOf(parent).w : W(), ph = parent ? sizeOf(parent).h : H();
    const xs = [0, pw, pw / 2], ys = [0, ph, ph / 2];
    if (parent) { xs.push(20, 28, pw - 20, pw - 28); ys.push(24, 26, 64, ph - 20, ph - 28); }
    else { xs.push(24, pw - 24); ys.push(24, ph - 24); }
    list.forEach((sib, i) => {
      if (i === idx) return;
      const s = sizeOf(sib), x = sib.x || 0, y = sib.y || 0;
      xs.push(x, x + s.w, x + s.w / 2, x - 20, x + s.w + 20);
      ys.push(y, y + s.h, y + s.h / 2, y - 20, y + s.h + 20);
    });
    return { xs, ys };
  }
  function nearest(value, lines, tol) {
    let best = null;
    for (const l of lines) { const d = Math.abs(value - l); if (d <= tol && (!best || d < best.d)) best = { d, l }; }
    return best;
  }
  function snapAxis(pos, size, lines, axis, free) {
    if (free) return pos;
    const tol = 6 / ed.scale;
    let best = null;
    for (const off of [0, size / 2, size]) {
      const hit = nearest(pos + off, lines, tol);
      if (hit && (!best || hit.d < best.d)) best = { d: hit.d, pos: hit.l - off, line: hit.l };
    }
    if (best) { ed.guides.push({ axis, at: best.line + (axis === 'x' ? ed.snapOrigin.x : ed.snapOrigin.y) }); return best.pos; }
    return ed.grid ? Math.round(pos / ed.grid) * ed.grid : pos;
  }
  function snapEdge(value, lines, axis, free) {
    if (free) return value;
    const hit = nearest(value, lines, 6 / ed.scale);
    if (hit) { ed.guides.push({ axis, at: hit.l + (axis === 'x' ? ed.snapOrigin.x : ed.snapOrigin.y) }); return hit.l; }
    return ed.grid ? Math.round(value / ed.grid) * ed.grid : value;
  }

  function startMove(p0) {
    const node = nodeAt(ed.sel), el = ed.elByCfg.get(node);
    const ox = node.x || 0, oy = node.y || 0, size = sizeOf(node);
    const lines = snapLines(ed.sel);
    ed.snapOrigin = ed.sel.length > 1 ? absRect(ed.sel.slice(0, -1)) : { x: 0, y: 0 };
    let moved = false;
    const onMove = e => {
      const p = toCanvas(e);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) * ed.scale < 3) return;
      moved = true;
      ed.guides = [];
      node.x = Math.round(snapAxis(ox + p.x - p0.x, size.w, lines.xs, 'x', e.altKey));
      node.y = Math.round(snapAxis(oy + p.y - p0.y, size.h, lines.ys, 'y', e.altKey));
      if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
      drawSelection();
    };
    const onUp = () => {
      removeEventListener('mousemove', onMove);
      ed.guides = [];
      if (moved) commit({ keepInspector: false }); else drawSelection();
    };
    addEventListener('mousemove', onMove);
    addEventListener('mouseup', onUp, { once: true });
  }
  function startResize(handle, p0) {
    const node = nodeAt(ed.sel), s0 = sizeOf(node);
    const o = { x: node.x || 0, y: node.y || 0, w: s0.w, h: s0.h };
    const lines = snapLines(ed.sel);
    ed.snapOrigin = ed.sel.length > 1 ? absRect(ed.sel.slice(0, -1)) : { x: 0, y: 0 };
    let moved = false;
    const onMove = e => {
      const p = toCanvas(e), dx = p.x - p0.x, dy = p.y - p0.y;
      moved = true;
      ed.guides = [];
      let { x, y, w, h: hh } = o;
      if (handle.includes('e')) w = snapEdge(o.x + o.w + dx, lines.xs, 'x', e.altKey) - x;
      if (handle.includes('s')) hh = snapEdge(o.y + o.h + dy, lines.ys, 'y', e.altKey) - y;
      if (handle.includes('w')) { x = snapEdge(o.x + dx, lines.xs, 'x', e.altKey); w = o.x + o.w - x; }
      if (handle.includes('n')) { y = snapEdge(o.y + dy, lines.ys, 'y', e.altKey); hh = o.y + o.h - y; }
      if (e.shiftKey && o.w && o.h) { const ratio = o.w / o.h; if (Math.abs(w - o.w) > Math.abs(hh - o.h)) hh = w / ratio; else w = hh * ratio; }
      node.x = Math.round(x); node.y = Math.round(y);
      node.w = Math.max(1, Math.round(w)); node.h = Math.max(1, Math.round(hh));
      liveRender();
    };
    const onUp = () => {
      removeEventListener('mousemove', onMove);
      ed.guides = [];
      if (moved) commit(); else drawSelection();
    };
    addEventListener('mousemove', onMove);
    addEventListener('mouseup', onUp, { once: true });
  }

  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0 || !ed.doc) return;
    e.preventDefault();
    // Offenes Eingabefeld abschließen, sonst landen Tasten wie Entf im Feld statt beim Element.
    const active = document.activeElement;
    if (active && active !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.blur();
    const p = toCanvas(e);
    const handle = e.target.closest && e.target.closest('.hd');
    if (handle && ed.sel) { startResize(handle.dataset.h, p); return; }
    const hit = hitTest(p);
    if (!hit) { select(null); return; }
    if (!samePath(hit, ed.sel)) select(hit);
    startMove(p);
  });
  wrap.addEventListener('dblclick', e => {
    // Doppelklick auf ein Element in einer Karte: nächstes Element darunter (z. B. verdeckte)
    const hit = hitTest(toCanvas(e), true);
    if (hit && !samePath(hit, ed.sel)) select(hit);
  });
  let hoverFrame = 0;
  wrap.addEventListener('mousemove', e => {
    if (e.buttons || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; if (ed.doc) drawHover(hitTest(toCanvas(e))); });
  });
  wrap.addEventListener('mouseleave', () => drawHover(null));

  // Ziehen aus der Elementliste oder der Sensorliste auf die Fläche
  const DND = 'application/x-sensorium';
  wrap.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes(DND)) return;
    e.preventDefault();
    wrap.classList.add('drop');
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
  wrap.addEventListener('drop', e => {
    wrap.classList.remove('drop');
    const raw = e.dataTransfer.getData(DND);
    if (!raw) return;
    e.preventDefault();
    const data = JSON.parse(raw), p = toCanvas(e);
    if (data.kind === 'type') addNode(newNode(data.type), p);
    else if (data.kind === 'sensor') addNode(sensorNode(data), p);
  });

  // ---------------------------------------------------------------- Auswahl und Bearbeiten
  function select(path) {
    ed.sel = path;
    if (path) for (let i = 1; i < path.length; i++) ed.open.add(treeKey(path.slice(0, i)));
    applyForce();
    drawSelection();
    renderTree();
    renderInspector();
  }
  function newNode(type) { return Object.assign({ type }, clone(TYPES[type].def)); }
  function sensorNode(d) {
    return { type: 'stat', label: d.name ? String(d.name).slice(0, 24) : 'Wert', sensor: d.key, unit: d.unit || '', w: 150, h: 60 };
  }
  function containerFor(at) {
    if (at) return hitTest(at, true);
    if (!ed.sel) return null;
    const n = nodeAt(ed.sel);
    return isContainer(n) ? ed.sel : ed.sel.length > 1 ? ed.sel.slice(0, -1) : null;
  }
  /** Fügt ein Element ein: auf die Seite (Karten) oder in die Karte unter dem Mauszeiger bzw. die gewählte Karte. */
  function addNode(cfg, at) {
    let container = cfg.type === 'card' ? null : containerFor(at);
    const list = container ? (nodeAt(container).children || (nodeAt(container).children = [])) : pageWidgets();
    const origin = container ? absRect(container) : { x: 0, y: 0, w: W(), h: H() };
    const w = cfg.w || 100, hh = cfg.h || 40;
    if (at) { cfg.x = Math.round(at.x - origin.x - w / 2); cfg.y = Math.round(at.y - origin.y - hh / 2); }
    else if (container) { cfg.x = 28; cfg.y = 64; }
    else { cfg.x = Math.round((W() - w) / 2); cfg.y = Math.round((H() - hh) / 2); }
    cfg.x = Math.max(0, Math.min(cfg.x, Math.max(0, origin.w - w)));
    cfg.y = Math.max(0, Math.min(cfg.y, Math.max(0, origin.h - hh)));
    if (ed.grid) { cfg.x = Math.round(cfg.x / ed.grid) * ed.grid; cfg.y = Math.round(cfg.y / ed.grid) * ed.grid; }
    list.push(cfg);
    ed.sel = (container || []).concat(list.length - 1);
    if (container) ed.open.add(treeKey(container));
    commit();
  }
  function removeSel() {
    if (!ed.sel) return;
    parentList(ed.sel).splice(lastOf(ed.sel), 1);
    ed.sel = ed.sel.length > 1 ? ed.sel.slice(0, -1) : null;
    commit();
  }
  function duplicateSel() {
    if (!ed.sel) return;
    const copy = clone(nodeAt(ed.sel)), list = parentList(ed.sel), i = lastOf(ed.sel);
    copy.x = (copy.x || 0) + 16;
    copy.y = (copy.y || 0) + 16;
    list.splice(i + 1, 0, copy);
    ed.sel = ed.sel.slice(0, -1).concat(i + 1);
    commit();
  }
  function copySel(cut) {
    if (!ed.sel) return;
    ed.clip = JSON.stringify(nodeAt(ed.sel));
    toast(cut ? 'Ausgeschnitten. Mit Strg+V in eine Karte einfügen.' : 'Kopiert. Mit Strg+V einfügen.');
    if (cut) removeSel();
  }
  function paste() {
    if (!ed.clip) return;
    const cfg = JSON.parse(ed.clip);
    let container = cfg.type === 'card' ? null : containerFor(null);
    const list = container ? (nodeAt(container).children || (nodeAt(container).children = [])) : pageWidgets();
    cfg.x = (cfg.x || 0) + 16;
    cfg.y = (cfg.y || 0) + 16;
    list.push(cfg);
    ed.sel = (container || []).concat(list.length - 1);
    commit();
  }
  function reorder(delta) {
    if (!ed.sel) return;
    const list = parentList(ed.sel), i = lastOf(ed.sel), j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    ed.sel = ed.sel.slice(0, -1).concat(j);
    commit();
  }
  let nudgeTimer = 0;
  function nudge(dx, dy) {
    const n = nodeAt(ed.sel);
    if (!n) return;
    n.x = (n.x || 0) + dx;
    n.y = (n.y || 0) + dy;
    const el = ed.elByCfg.get(n);
    if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
    drawSelection();
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => commit(), 400);
  }

  addEventListener('keydown', e => {
    const a = document.activeElement;
    const typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 's') { e.preventDefault(); save(); return; }
    if (!$('#ed-modal').hidden || typing) return;
    if (e.ctrlKey && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.ctrlKey && k === 'y') { e.preventDefault(); redo(); }
    else if (e.ctrlKey && k === 'd') { e.preventDefault(); duplicateSel(); }
    else if (e.ctrlKey && k === 'c') { e.preventDefault(); copySel(false); }
    else if (e.ctrlKey && k === 'x') { e.preventDefault(); copySel(true); }
    else if (e.ctrlKey && k === 'v') { e.preventDefault(); paste(); }
    else if (k === 'delete' || k === 'backspace') { if (ed.sel) { e.preventDefault(); removeSel(); } }
    else if (k === 'escape') { select(ed.sel && ed.sel.length > 1 ? ed.sel.slice(0, -1) : null); }
    else if (k.startsWith('arrow') && ed.sel) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
    }
  });

  // ---------------------------------------------------------------- Seiten (Kopfzeile)
  function renderPages() {
    const nav = $('#ed-pages');
    nav.textContent = '';
    if (!ed.doc) return;
    ed.doc.pages.forEach((p, i) => nav.append(h('button', {
      class: 'tab' + (i === ed.page ? ' on' : ''), text: p.name || p.short || `Seite ${i + 1}`,
      title: 'Doppelklick: Seite einstellen', onclick: () => setPage(i), ondblclick: () => openTab('pages'),
    })));
    nav.append(h('button', { class: 'tab add', text: '+', title: 'Neue Seite', onclick: addPage }));
  }
  function setPage(i) {
    if (i === ed.page) return;
    ed.page = i;
    ed.sel = null;
    renderAll();
  }
  function addPage() {
    const n = ed.doc.pages.length + 1;
    ed.doc.pages.push({ id: 'seite' + n, name: 'Seite ' + n, short: 'Seite ' + n, widgets: [] });
    ed.page = ed.doc.pages.length - 1;
    ed.sel = null;
    commit({ bottom: true });
    renderAll();
  }

  // ---------------------------------------------------------------- Ebenen
  const treeKey = path => ed.page + ':' + path.join('.');
  function nodeName(n) {
    const text = n.label || plain(n.title) || plain(n.text) || (n.entity ? describe('ha:' + n.entity).name : '') || (n.sensor ? describe(n.sensor).name : '') || (n.type === 'drive' ? 'Laufwerk ' + (n.letter || 'C') : '') || (n.name && n.type === 'icon' ? n.name : '');
    if (text) return text;
    if (isContainer(n)) {
      // Karte ohne Überschrift: nach dem ersten sprechenden Inhalt benennen (z. B. „Uhr“, „Leistungsaufnahme“).
      const queue = [...(n.children || [])];
      while (queue.length) {
        const c = queue.shift();
        if (c.type === 'clock') return 'Uhr';
        if ((c.type === 'header' || c.type === 'label') && c.text) return plain(c.text);
        if (c.children) queue.push(...c.children);
      }
    }
    return typeName(n);
  }
  function renderTree() {
    const tree = $('#ed-tree');
    tree.textContent = '';
    ed.treeRows = [];
    if (!ed.doc) return;
    const walk = (list, path, depth) => list.forEach((n, i) => {
      const p = path.concat(i), key = treeKey(p), kids = n.children && n.children.length;
      const open = kids && (ed.open.has(key) || (ed.sel && ed.sel.length > p.length && samePath(ed.sel.slice(0, p.length), p)));
      const caret = h('span', { class: 'caret' + (open ? ' open' : ''), html: kids ? svg('caret') : '' });
      if (kids) caret.addEventListener('mousedown', e => { e.stopPropagation(); if (ed.open.has(key)) ed.open.delete(key); else ed.open.add(key); renderTree(); });
      const cond = n.visibleIf || n.hiddenIf ? h('span', { class: 'e-tag', text: 'bedingt', title: 'Wird nur unter einer Bedingung gezeigt' }) : null;
      const row = h('div', { class: 'node' + (samePath(p, ed.sel) ? ' on' : ''), style: `padding-left:${8 + depth * 15}px`, title: typeName(n) },
        caret, h('span', { html: svg(typeIcon(n), 'ti') }), h('span', { class: 'nm', text: nodeName(n) }), cond,
        n.type === 'card' ? h('span', { class: 'sub', text: `${(n.children || []).length}` }) : null);
      row.addEventListener('mousedown', () => select(p));
      tree.append(row);
      ed.treeRows.push({ row, n, p });
      if (open) walk(n.children, p, depth + 1);
    });
    walk(pageWidgets(), [], 0);
    if (!pageWidgets().length) tree.append(h('div', { class: 'note', style: 'padding:10px 14px', text: 'Die Seite ist leer. Ziehe eine Karte aus „Elemente“ auf die Fläche.' }));
    refreshTreeVisibility();
    const on = tree.querySelector('.node.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function refreshTreeVisibility() {
    for (const { row, n, p } of ed.treeRows) {
      let hidden = false;
      for (let i = 1; i <= p.length && !hidden; i++) { const x = nodeAt(p.slice(0, i)); if (x && !visible(x)) hidden = true; }
      row.classList.toggle('hidden', hidden);
    }
  }

  // ---------------------------------------------------------------- Elemente (Palette)
  function renderPalette() {
    const box = $('#ed-palette'), q = $('#ed-pq').value.trim().toLowerCase();
    box.textContent = '';
    const groups = new Map();
    for (const [type, t] of Object.entries(TYPES)) {
      if (q && !(t.name.toLowerCase().includes(q) || type.includes(q) || t.group.toLowerCase().includes(q))) continue;
      if (!groups.has(t.group)) groups.set(t.group, []);
      groups.get(t.group).push([type, t]);
    }
    for (const [group, items] of groups) {
      box.append(h('div', { class: 'pgroup', text: group }));
      const grid = h('div', { class: 'pgrid' });
      for (const [type, t] of items) {
        const tile = h('div', { class: 'ptile', draggable: 'true', title: `${t.name}: klicken oder auf die Fläche ziehen`, html: svg(t.icon) }, h('span', { text: t.name }));
        tile.addEventListener('click', () => addNode(newNode(type)));
        tile.addEventListener('dragstart', e => { e.dataTransfer.setData(DND, JSON.stringify({ kind: 'type', type })); e.dataTransfer.effectAllowed = 'copy'; });
        grid.append(tile);
      }
      box.append(grid);
    }
  }
  $('#ed-pq').addEventListener('input', renderPalette);

  // ---------------------------------------------------------------- Werte: Namen und Anzeige
  function describe(key) {
    if (!key) return { name: '', src: '' };
    const k = String(key);
    const alias = Sx.st.aliasByName.get(k);
    if (alias) return { name: alias.label || k, src: 'Zuordnung' };
    const formulas = (ed.doc && ed.doc.formulas) || {};
    if (formulas[k]) return { name: (typeof formulas[k] === 'object' && formulas[k].label) || k, src: 'Formel' };
    const sensor = Sx.st.byId.get(k);
    if (sensor) return { name: sensor.name, src: sensor.hw };
    const m = /^ha:([a-z0-9_]+\.[a-z0-9_]+)([@#].+)?$/.exec(k);
    if (m) {
      const e = ed.dirById.get(m[1]);
      const base = e ? e.name : (Sx.st.byId.get('ha:' + m[1]) || {}).name || m[1];
      const extra = m[2] ? (m[2] === '#state' ? ' · Zustand' : m[2] === '#changed' ? ' · letzte Änderung' : m[2] === '#forecast' ? ' · Vorhersage' : ' · ' + m[2].slice(1)) : '';
      return { name: base + extra, src: 'Home Assistant' };
    }
    const t = /^tasmota:([^/]+)\/(.+)$/.exec(k);
    if (t) return { name: `Steckdose ${t[1]} · ${t[2]}`, src: 'Tasmota' };
    return { name: k, src: '' };
  }
  function unitOf(key) {
    const s = Sx.st.byId.get(key) || Sx.st.byId.get(Sx.aliasTarget(key) || '');
    if (s) return s.unit || '';
    if (key.startsWith('ha:')) { const e = ed.dirById.get(key.slice(3)); if (e && !/[@#]/.test(key)) return e.unit || ''; }
    if (/^tasmota:.*\/power$/.test(key)) return 'W';
    return '';
  }
  function fmtValue(key) {
    if (!key) return '';
    const v = Sx.get(key);
    if (v === undefined) return '';
    if (v == null) return '–';
    if (Array.isArray(v)) return `${v.length} Werte`;
    if (typeof v === 'boolean') return v ? 'ja' : 'nein';
    if (typeof v === 'number') {
      const u = unitOf(key);
      if (u === 'B/s') return Sx.rate(v).join(' ');
      if (u === 'B') return Sx.size(v).join(' ');
      return Sx.fmt(v, Number.isInteger(v) || Math.abs(v) >= 100 ? 0 : 1) + (u ? ' ' + u : '');
    }
    return Sx.de(v);
  }
  function refreshLive() {
    for (const el of document.querySelectorAll('[data-live]')) {
      const t = fmtValue(el.dataset.live) || el.dataset.fallback || '';
      if (el.textContent !== t) el.textContent = t;
    }
  }

  // ---------------------------------------------------------------- Sensorliste (unten und im Auswahlfenster)
  function hiddenFloors() { try { return new Set(JSON.parse(localStorage.getItem(FLOOR_KEY) || '[]')); } catch { return new Set(); } }
  function setHiddenFloors(set) { try { localStorage.setItem(FLOOR_KEY, JSON.stringify([...set])); } catch { /* egal */ } }
  function ensureDir() {
    if (ed.dir || ed.dirLoading || !Sx.isHost) return;
    ed.dirLoading = true;
    Sx.post({ type: 'haDirectory' });
  }
  function allRows(opt) {
    const rows = [];
    if (!opt.entityOnly) {
      for (const a of Sx.st.aliases) rows.push({ key: a.name, name: a.label || a.name, src: 'Zuordnung · ' + a.group, grp: 'alias' });
      for (const [k, f] of Object.entries(ed.doc.formulas || {})) rows.push({ key: k, name: (typeof f === 'object' && f.label) || k, src: 'Formel', grp: 'formula' });
      for (const s of Sx.st.catalog) {
        if (s.hwType === 'HomeAssistant') continue;
        rows.push({ key: s.id, name: s.name, src: s.hw, grp: s.hwType === 'Plug' ? 'plug' : 'pc', unit: s.unit });
      }
    }
    if (ed.dir) {
      for (const e of ed.dir.entities) {
        if (opt.domains && !opt.domains.some(d => e.id.startsWith(d + '.'))) continue;
        rows.push({ key: 'ha:' + e.id, name: e.name, src: [e.floor, e.area].filter(Boolean).join(' · ') || 'Home Assistant', grp: 'ha', ha: e, floor: e.floor || '' });
      }
    }
    return rows;
  }
  /**
   * Durchsuchbare Liste aller Werte. opt: { mode: 'modal'|'dock', onPick(key), entityOnly, domains, attrs }
   * Home-Assistant-Einträge lassen sich aufklappen (Zustand, letzte Änderung, Attribute).
   */
  function sensorList(box, opt) {
    const st = { q: '', grp: opt.entityOnly ? 'ha' : opt.grp || 'all', open: new Set() };
    box.textContent = '';
    const q = h('input', { type: 'search', placeholder: opt.entityOnly ? 'Gerät suchen …' : 'Sensoren, Zuordnungen, Home Assistant durchsuchen …', autocomplete: 'off', spellcheck: 'false' });
    const chips = h('span', { class: 'btools', style: 'margin:0' }), floors = h('span', { class: 'btools', style: 'margin:0' });
    box.append(h('div', { class: 'btools' }, q, chips, floors));
    const tbody = h('tbody');
    box.append(h('table', { class: 'et' },
      h('colgroup', null, h('col', { style: 'width:34%' }), h('col', { style: 'width:22%' }), h('col', { style: 'width:30%' }), h('col', { style: 'width:14%' })),
      h('thead', null, h('tr', null, h('th', { text: 'Name' }), h('th', { text: 'Quelle' }), h('th', { text: 'Schlüssel' }), h('th', { text: 'Wert', style: 'text-align:right' }))),
      tbody));
    const note = h('div', { class: 'more' });
    box.append(note);
    q.addEventListener('input', () => { st.q = q.value.trim().toLowerCase(); draw(); });

    const GROUPS = opt.entityOnly ? [['ha', 'Home Assistant']] : [['all', 'Alle'], ['alias', 'Zuordnungen'], ['formula', 'Formeln'], ['pc', 'PC'], ['plug', 'Steckdosen'], ['ha', 'Home Assistant']];
    function draw() {
      if (st.grp === 'all' || st.grp === 'ha') ensureDir();
      const all = allRows(opt), hidden = hiddenFloors();
      chips.textContent = '';
      for (const [id, label] of GROUPS) {
        const count = id === 'all' ? all.length : all.filter(r => r.grp === id).length;
        if (id !== 'all' && id !== 'ha' && !count) continue;
        chips.append(h('button', { class: 'e-chip' + (st.grp === id ? ' on' : ''), onclick: () => { st.grp = id; draw(); } }, label, h('span', { text: String(count) })));
      }
      floors.textContent = '';
      if (ed.dir && ed.dir.floors.length && (st.grp === 'ha' || st.grp === 'all')) {
        for (const f of [...ed.dir.floors, '']) {
          const on = !hidden.has(f);
          floors.append(h('button', {
            class: 'e-chip' + (on ? ' on' : ''), text: f || 'ohne Etage', title: on ? 'Klicken zum Ausblenden' : 'Klicken zum Einblenden',
            onclick: () => { if (hidden.has(f)) hidden.delete(f); else hidden.add(f); setHiddenFloors(hidden); draw(); },
          }));
        }
      }
      const words = st.q.split(/\s+/).filter(Boolean);
      const rows = all.filter(r => (st.grp === 'all' || r.grp === st.grp) && !(r.grp === 'ha' && hidden.has(r.floor))
        && words.every(w => `${r.name} ${r.key} ${r.src}`.toLowerCase().includes(w)));
      tbody.textContent = '';
      const LIMIT = 400;
      for (const r of rows.slice(0, LIMIT)) addRow(r, false);
      note.textContent = rows.length > LIMIT ? `… und ${rows.length - LIMIT} weitere. Suche genauer, um sie zu sehen.`
        : !rows.length ? (st.grp === 'ha' && !ed.dir ? (Sx.isHost ? 'Lade Liste aus Home Assistant …' : 'Home Assistant ist nur im Sensorium-Programm verfügbar.') : 'Keine Treffer.') : '';
      refreshLive();
    }
    function addRow(r, sub) {
      const expandable = !sub && r.ha && opt.attrs !== false;
      const exp = h('span', { class: 'expand', text: expandable ? (st.open.has(r.key) ? '▾' : '▸') : '' });
      const valCell = h('td', { class: 'val', 'data-live': r.key });
      if (r.ha && !sub) { valCell.dataset.fallback = (r.ha.state || '') + (r.ha.unit ? ' ' + r.ha.unit : ''); valCell.classList.add('dim'); }
      const tr = h('tr', { class: 'row' + (sub ? ' sub' : ''), title: r.key },
        h('td', null, exp, sub ? h('span', { style: 'padding-left:14px', text: r.name }) : r.name),
        h('td', null, h('span', { class: 'src ' + r.grp, text: r.src })),
        h('td', { class: 'key', text: r.key }), valCell);
      if (expandable) exp.addEventListener('click', e => { e.stopPropagation(); if (st.open.has(r.key)) st.open.delete(r.key); else st.open.add(r.key); draw(); });
      if (opt.mode === 'dock') {
        tr.draggable = true;
        tr.addEventListener('dragstart', e => { e.dataTransfer.setData(DND, JSON.stringify({ kind: 'sensor', key: r.key, name: r.name, unit: r.unit || (r.ha && r.ha.unit) || '' })); e.dataTransfer.effectAllowed = 'copy'; });
        tr.addEventListener('dblclick', () => opt.onPick(r.key, r));
      } else {
        tr.addEventListener('click', () => opt.onPick(r.key, r));
      }
      tbody.append(tr);
      if (expandable && st.open.has(r.key)) {
        const id = r.ha.id, subs = [['#state', 'Zustand (Text)'], ['#changed', 'letzte Änderung']];
        for (const a of r.ha.attrs || []) subs.push(['@' + a, a]);
        for (const [suffix, label] of subs) addRow({ key: `ha:${id}${suffix}`, name: label, src: 'Attribut', grp: 'ha' }, true);
      }
    }
    draw();
    const handle = { draw, focus: () => q.focus() };
    ed.lists.add(handle);
    return handle;
  }
  function redrawLists() { for (const l of [...ed.lists]) { try { l.draw(); } catch { ed.lists.delete(l); } } }

  function openModal(title, build, onClose) {
    const m = $('#ed-modal');
    m.textContent = '';
    m.hidden = false;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      m.hidden = true;
      m.textContent = '';
      removeEventListener('keydown', esc, true);
      ed.lists.clear();
      if (ed.tab === 'sensors') renderBottom();
      if (onClose) onClose();
    };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', esc, true);
    const body = h('div', { class: 'dbody' }), foot = h('footer');
    m.append(h('div', { class: 'dlg' }, h('header', null, h('h2', { text: title }), h('button', { class: 'icon-btn x', html: svg('close'), title: 'Schließen', onclick: close })), body, foot));
    m.onmousedown = e => { if (e.target === m) close(); };
    build(body, foot, close);
    return close;
  }
  /** Auswahlfenster für einen Wert. Liefert den Schlüssel (z. B. „cpu.temp“, „ha:sensor.x“) oder null. */
  function pickSensor(opt = {}) {
    return new Promise(resolve => {
      let result = null;
      openModal(opt.title || 'Wert auswählen', (body, foot, close) => {
        const list = sensorList(body, {
          mode: 'modal', entityOnly: opt.entityOnly, domains: opt.domains, attrs: !opt.entityOnly,
          onPick: key => { result = key; close(); },
        });
        if (!opt.entityOnly) {
          const own = h('input', { type: 'text', placeholder: 'eigener Schlüssel, z. B. ha:sensor.x', spellcheck: 'false' });
          const ip = h('input', { type: 'text', placeholder: 'Tasmota-Steckdose: IP-Adresse', spellcheck: 'false' });
          foot.append(own, h('button', { class: 'ghost', text: 'Übernehmen', onclick: () => { if (own.value.trim()) { result = own.value.trim(); close(); } } }),
            h('span', { style: 'flex:1' }), ip,
            h('button', {
              class: 'ghost', text: 'Steckdose nehmen', title: 'Fragt die Steckdose jede Sekunde direkt ab (nur lesend)',
              onclick: () => { const v = ip.value.trim(); if (/^[A-Za-z0-9][A-Za-z0-9.\-]*$/.test(v)) { result = `tasmota:${v}/power`; close(); } else toast('Bitte eine IP-Adresse oder einen Gerätenamen eingeben.'); },
            }));
        } else {
          foot.append(h('span', { class: 'note', text: 'Tipp: Mit den Etagen-Knöpfen blendest du Bereiche aus, die nicht auf dein Panel gehören.' }));
        }
        setTimeout(() => list.focus(), 0);
      }, () => resolve(result));
    });
  }

  // ---------------------------------------------------------------- Eigenschaften (rechts)
  function setVal(node, key, value, live) {
    const empty = value === '' || value === undefined || value === null || (Array.isArray(value) && !value.length && key !== 'children');
    if (empty) delete node[key]; else node[key] = value;
    if (live) liveRender(); else commit({ keepInspector: true });
  }
  const frow = (label, ctl, top) => h('div', { class: 'frow' + (top ? ' top' : '') }, h('div', { class: 'fl', text: label }), h('div', { class: 'fctl' }, ctl));
  function sect(title, ...kids) { return h('div', { class: 'sect' }, h('h3', null, title), ...kids); }

  function textInput(node, key, placeholder) {
    const inp = h('input', { type: 'text', value: node[key] ?? '', placeholder: placeholder || '', spellcheck: 'false' });
    inp.addEventListener('input', () => setVal(node, key, inp.value, true));
    inp.addEventListener('change', () => setVal(node, key, inp.value, false));
    return inp;
  }
  function numInput(node, key, placeholder) {
    const inp = h('input', { type: 'text', value: node[key] ?? '', placeholder: placeholder || '', inputmode: 'decimal', spellcheck: 'false' });
    inp.addEventListener('input', () => { const n = parseNum(inp.value); inp.classList.toggle('bad', n === null); if (n !== null) setVal(node, key, n, true); });
    inp.addEventListener('change', () => { const n = parseNum(inp.value); if (n !== null) setVal(node, key, n, false); });
    return inp;
  }
  function boolInput(node, key, label, defaultTrue) {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = defaultTrue ? node[key] !== false : !!node[key];
    cb.addEventListener('change', () => setVal(node, key, defaultTrue ? (cb.checked ? undefined : false) : (cb.checked ? true : undefined), false));
    return h('label', { class: 'switch' }, cb, h('i'), label || '');
  }
  function selectInput(node, key, options) {
    const sel = h('select');
    for (const [v, label] of options) sel.append(h('option', { value: v, text: label }));
    const cur = node[key] == null ? '' : String(node[key]);
    if (!options.some(([v]) => v === cur)) sel.append(h('option', { value: cur, text: cur }));
    sel.value = cur;
    sel.addEventListener('change', () => { const v = sel.value; setVal(node, key, v === '' ? undefined : (/^\d+$/.test(v) && key === 'weight' ? +v : v), false); });
    return sel;
  }
  function colorCss(v) { return !v ? 'transparent' : v[0] === '@' ? `var(--${v.slice(1)})` : v; }
  function colorInput(node, key) {
    const v = node[key] ?? '';
    const sel = h('select');
    for (const [c, label] of THEME_COLORS) sel.append(h('option', { value: c, text: label }));
    sel.append(h('option', { value: '#', text: 'eigene Farbe …' }));
    const pick = h('input', { type: 'color', style: 'width:40px;flex:none;padding:2px;height:30px' });
    const sw = h('span', { class: 'swatch', style: `background:${colorCss(v)}` });
    const custom = v && v[0] !== '@';
    sel.value = custom ? '#' : v;
    pick.hidden = !custom;
    if (custom && /^#[0-9a-f]{6}$/i.test(v)) pick.value = v;
    sel.addEventListener('change', () => {
      if (sel.value === '#') { pick.hidden = false; pick.click(); return; }
      pick.hidden = true;
      sw.style.background = colorCss(sel.value);
      setVal(node, key, sel.value || undefined, false);
    });
    pick.addEventListener('input', () => { sw.style.background = pick.value; setVal(node, key, pick.value, true); });
    pick.addEventListener('change', () => setVal(node, key, pick.value, false));
    return [sw, sel, pick];
  }
  function sensorBox(value, onPick, onClear, opt = {}) {
    const info = describe(value);
    const box = h('div', { class: 'sensor-box' + (value ? '' : ' empty'), title: value || '' },
      h('div', { class: 'sb-main' }, h('div', { class: 'sb-name', text: value ? info.name : (opt.empty || 'Wert auswählen …') }), value ? h('div', { class: 'sb-key', text: value }) : null),
      value ? h('div', { class: 'sb-val', 'data-live': value }) : null);
    box.addEventListener('click', async () => { const k = await pickSensor(opt); if (k) onPick(k); });
    const clear = value && onClear ? h('button', { class: 'icon-btn', html: svg('close'), title: 'Entfernen', onclick: e => { e.stopPropagation(); onClear(); } }) : null;
    return [box, clear];
  }
  function sensorInput(node, key, label) {
    return sensorBox(node[key], k => { setVal(node, key, k); renderInspector(); }, () => { setVal(node, key, undefined); renderInspector(); }, { title: `Wert für „${label}“` });
  }
  function entityInput(node, key, label, domains) {
    const value = node[key] ? 'ha:' + node[key] : '';
    return sensorBox(value, k => { setVal(node, key, k.replace(/^ha:/, '').replace(/[@#].*$/, '')); renderInspector(); },
      () => { setVal(node, key, undefined); renderInspector(); }, { title: `${label} auswählen`, entityOnly: true, domains, empty: 'Gerät auswählen …' });
  }
  function numOrSensorInput(node, key, label) {
    const inp = h('input', { type: 'text', value: node[key] ?? '', placeholder: 'Zahl oder Wert', spellcheck: 'false' });
    const parse = () => { const n = parseNum(inp.value); return n === undefined ? undefined : n !== null ? n : inp.value.trim(); };
    inp.addEventListener('input', () => setVal(node, key, parse(), true));
    inp.addEventListener('change', () => setVal(node, key, parse(), false));
    const btn = h('button', { class: 'icon-btn', html: svg('pick'), title: 'Wert auswählen', onclick: async () => { const k = await pickSensor({ title: `Wert für „${label}“` }); if (k) { setVal(node, key, k); renderInspector(); } } });
    return [inp, btn];
  }
  function iconInput(node, key) {
    const sel = h('select');
    sel.append(h('option', { value: '', text: '(kein Symbol)' }));
    for (const name of Widgets.iconNames()) sel.append(h('option', { value: name, text: name }));
    sel.value = node[key] || '';
    const prev = h('span', { class: 'swatch', style: 'display:grid;place-items:center;color:var(--e-acc)', html: node[key] ? Widgets.icon(node[key], 18).outerHTML : '' });
    sel.addEventListener('change', () => { prev.innerHTML = sel.value ? Widgets.icon(sel.value, 18).outerHTML : ''; setVal(node, key, sel.value || undefined, false); });
    return [prev, sel];
  }
  function strListInput(node, key) {
    const ta = h('textarea', { rows: 2, spellcheck: 'false' });
    ta.value = (node[key] || []).join('\n');
    ta.addEventListener('change', () => setVal(node, key, ta.value.split('\n').map(s => s.trim()).filter(Boolean), false));
    return ta;
  }
  function jsonInput(node, key) {
    const ta = h('textarea', { spellcheck: 'false' });
    ta.value = node[key] === undefined ? '' : JSON.stringify(node[key], null, 2);
    ta.rows = Math.min(14, Math.max(3, ta.value.split('\n').length));
    ta.addEventListener('change', () => {
      const t = ta.value.trim();
      if (!t) { ta.classList.remove('bad'); setVal(node, key, undefined); return; }
      try { const v = JSON.parse(t); ta.classList.remove('bad'); setVal(node, key, v); }
      catch (e) { ta.classList.add('bad'); toast('Kein gültiges JSON: ' + e.message); }
    });
    return ta;
  }
  function insertButton(node, key, input) {
    return h('button', {
      class: 'icon-btn', html: svg('pick'), title: 'Wert einfügen, z. B. {cpu.temp:0}',
      onclick: async () => {
        const k = await pickSensor({ title: 'Wert in den Text einfügen' });
        if (!k) return;
        const text = input.value, at = input.selectionStart ?? text.length;
        input.value = text.slice(0, at) + `{${k}}` + text.slice(input.selectionEnd ?? at);
        setVal(node, key, input.value, false);
      },
    });
  }
  /** Eigenschaft nach Art. */
  function field(node, spec) {
    const [key, label, kind, extra] = spec;
    switch (kind) {
      case 'text': return frow(label, textInput(node, key));
      case 'tpl': { const inp = textInput(node, key); return frow(label, [inp, insertButton(node, key, inp)]); }
      case 'num': return frow(label, numInput(node, key));
      case 'bool': return frow(label, boolInput(node, key, '', extra === true));
      case 'select': return frow(label, selectInput(node, key, extra));
      case 'color': return frow(label, colorInput(node, key));
      case 'sensor': return frow(label, sensorInput(node, key, label));
      case 'entity': return frow(label, entityInput(node, key, label, extra));
      case 'numOrSensor': return frow(label, numOrSensorInput(node, key, label));
      case 'icon': return frow(label, iconInput(node, key));
      case 'strlist': return frow(label, strListInput(node, key), true);
      case 'json': return frow(label, jsonInput(node, key), true);
      case 'list': return listField(node, key, label, extra);
      case 'rules': return listField(node, key, label, RULE_FIELDS);
      default: return null;
    }
  }
  /** Liste von Einträgen (Verbraucher, Heizungen, Farbregeln …) mit eigenen Feldern je Eintrag. */
  function listField(node, key, label, fields) {
    const items = Array.isArray(node[key]) ? node[key] : [];
    const box = h('div', { class: 'lst' });
    const save = () => setVal(node, key, items, false);
    items.forEach((item, i) => {
      const row = h('div', { class: 'lrow' });
      for (const [k, l, kind, extra] of fields) {
        if (kind === 'sensor' || kind === 'entity') {
          const value = kind === 'entity' ? (item[k] ? 'ha:' + item[k] : '') : item[k];
          row.append(...sensorBox(value,
            v => { item[k] = kind === 'entity' ? v.replace(/^ha:/, '').replace(/[@#].*$/, '') : v; save(); renderInspector(); },
            () => { delete item[k]; save(); renderInspector(); },
            { title: `${l} auswählen`, entityOnly: kind === 'entity', domains: extra, empty: l + ' …' }).filter(Boolean));
        } else if (kind === 'bool') {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = !!item[k];
          cb.addEventListener('change', () => { if (cb.checked) item[k] = true; else delete item[k]; save(); });
          row.append(h('label', { class: 'switch', style: 'flex:none' }, cb, h('i'), l));
        } else if (kind === 'color') {
          const sel = h('select', { title: l });
          for (const [c, name] of THEME_COLORS) sel.append(h('option', { value: c, text: name }));
          if (item[k] && !THEME_COLORS.some(([c]) => c === item[k])) sel.append(h('option', { value: item[k], text: item[k] }));
          sel.value = item[k] || '';
          sel.addEventListener('change', () => { if (sel.value) item[k] = sel.value; else delete item[k]; save(); });
          row.append(sel);
        } else {
          const inp = h('input', { type: 'text', value: item[k] ?? '', placeholder: l, title: l, spellcheck: 'false' });
          inp.addEventListener('change', () => {
            const t = inp.value.trim();
            if (kind === 'num') { const n = parseNum(t); if (n === null) { inp.classList.add('bad'); return; } inp.classList.remove('bad'); if (n === undefined) delete item[k]; else item[k] = n; }
            else if (t) item[k] = t; else delete item[k];
            save();
          });
          row.append(inp);
        }
      }
      row.append(
        h('button', { class: 'icon-btn', html: svg('up'), title: 'nach oben', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; save(); renderInspector(); } }),
        h('button', { class: 'icon-btn', html: svg('trash'), title: 'Entfernen', onclick: () => { items.splice(i, 1); save(); renderInspector(); } }));
      box.append(row);
    });
    const add = h('button', {
      class: 'mini', text: '+ Hinzufügen',
      onclick: () => { const item = {}; if (fields === RULE_FIELDS) { item.from = 0; item.color = '@warn'; } items.push(item); node[key] = items; save(); renderInspector(); },
    });
    return h('div', { class: 'lst' }, h('div', { class: 'frow' }, h('div', { class: 'fl', text: label }), h('div', { class: 'fctl', style: 'justify-content:flex-end' }, add)), box);
  }

  // Bedingungen: Liste „Wert – Vergleich – Zahl/Text“, alle müssen zutreffen.
  const condSimple = c => (Array.isArray(c) ? c : [c]).every(x => x && typeof x === 'object' && x.sensor && Object.keys(x).every(k => k === 'sensor' || OPS.some(([o]) => o === k)));
  function condToRows(c) {
    if (!c) return [];
    return (Array.isArray(c) ? c : [c]).map(x => {
      const op = (OPS.find(([o]) => o in x) || ['exists'])[0];
      let value = x[op];
      if (op === 'exists') value = x.exists === false ? 'nein' : 'ja';
      else if (op === 'in') value = (x.in || []).join(', ');
      return { sensor: x.sensor, op, value: value == null ? '' : String(value) };
    });
  }
  function rowsToCond(rows) {
    const list = rows.filter(r => r.sensor).map(r => {
      const o = { sensor: r.sensor };
      if (r.op === 'exists') o.exists = r.value !== 'nein';
      else if (r.op === 'in') o.in = r.value.split(',').map(s => s.trim()).filter(Boolean);
      else { const n = parseNum(r.value); o[r.op] = n === undefined ? 0 : n !== null ? n : r.value.trim(); }
      return o;
    });
    return !list.length ? undefined : list.length === 1 ? list[0] : list;
  }
  function condField(node, key, label) {
    const c = node[key];
    if (c && !condSimple(c)) return frow(label + ' (JSON)', jsonInput(node, key), true);
    const rows = condToRows(c);
    const box = h('div', { class: 'lst' });
    const save = () => setVal(node, key, rowsToCond(rows), false);
    rows.forEach((r, i) => {
      const op = h('select', { style: 'flex:0 0 120px' });
      for (const [o, l] of OPS) op.append(h('option', { value: o, text: l }));
      op.value = r.op;
      const val = h('input', { type: 'text', value: r.value, placeholder: r.op === 'exists' ? 'ja / nein' : 'Zahl oder Text', spellcheck: 'false' });
      op.addEventListener('change', () => { r.op = op.value; save(); });
      val.addEventListener('change', () => { r.value = val.value; save(); });
      box.append(h('div', { class: 'lrow' },
        ...sensorBox(r.sensor, k => { r.sensor = k; save(); renderInspector(); }, null, { title: 'Wert für die Bedingung' }).filter(Boolean),
        op, val, h('button', { class: 'icon-btn', html: svg('trash'), title: 'Entfernen', onclick: () => { rows.splice(i, 1); save(); renderInspector(); } })));
    });
    const add = h('button', {
      class: 'mini', text: '+ Bedingung',
      onclick: async () => { const k = await pickSensor({ title: 'Wert für die Bedingung' }); if (!k) return; rows.push({ sensor: k, op: 'gt', value: '0' }); save(); renderInspector(); },
    });
    return h('div', { class: 'lst' }, h('div', { class: 'frow' }, h('div', { class: 'fl', text: label }), h('div', { class: 'fctl', style: 'justify-content:flex-end' }, add)), box,
      rows.length > 1 ? h('div', { class: 'note', text: 'Alle Bedingungen müssen zutreffen.' }) : null);
  }

  function renderInspector() {
    const box = $('#ed-inspector');
    box.textContent = '';
    if (!ed.doc) return;
    const node = nodeAt(ed.sel);
    if (!node) { box.append(emptyInspector()); refreshLive(); return; }
    const parent = parentOf(ed.sel);
    box.append(h('div', { class: 'ihead' },
      h('div', { class: 'big-ic', html: svg(typeIcon(node)) }),
      h('div', { class: 'txt-col' }, h('div', { class: 't1', text: nodeName(node) }),
        h('div', { class: 't2', text: typeName(node) + (parent ? ` · in „${nodeName(parent)}“` : ` · auf „${curPage().name || 'Seite'}“`) }))));
    box.append(h('div', { class: 'iactions' },
      parent ? h('button', { class: 'mini', html: svg('parent') + ' Übergeordnet', title: 'Übergeordnetes Element wählen (Esc)', onclick: () => select(ed.sel.slice(0, -1)) }) : null,
      h('button', { class: 'mini', html: svg('up') + ' Vor', title: 'Eine Ebene nach vorn', onclick: () => reorder(1) }),
      h('button', { class: 'mini', html: svg('down') + ' Zurück', title: 'Eine Ebene nach hinten', onclick: () => reorder(-1) }),
      h('button', { class: 'mini', html: svg('copy') + ' Duplizieren', title: 'Strg+D', onclick: duplicateSel }),
      h('button', { class: 'mini danger', html: svg('trash') + ' Löschen', title: 'Entf', onclick: removeSel })));

    const pos = h('div', { class: 'pos4' });
    for (const [k, l] of [['x', 'X'], ['y', 'Y'], ['w', 'B'], ['h', 'H']]) {
      const inp = numInput(node, k);
      pos.append(h('label', null, h('span', { text: l }), inp));
    }
    box.append(sect('Position und Größe', pos));

    const specs = FIELDS[node.type];
    if (specs && specs.length) box.append(sect('Eigenschaften', ...specs.map(s => field(node, s)).filter(Boolean)));
    else if (!specs) box.append(sect('Eigenschaften', h('div', { class: 'note', text: 'Für diesen Baustein gibt es keine Formularfelder. Nutze „Erweitert“.' })));

    box.append(sect('Sichtbarkeit',
      condField(node, 'visibleIf', 'Nur zeigen, wenn'),
      condField(node, 'hiddenIf', 'Ausblenden, wenn'),
      h('div', { class: 'note', text: 'Beispiel: Kachel „Framerate“ nur zeigen, wenn fps.current > 0.' })));

    // Erweitert: alle Einstellungen als JSON (ohne Kinder)
    const own = Object.assign({}, node);
    delete own.children;
    const ta = h('textarea', { spellcheck: 'false', rows: 8 });
    ta.value = JSON.stringify(own, null, 2);
    const apply = h('button', {
      class: 'mini', text: 'Übernehmen',
      onclick: () => {
        try {
          const v = JSON.parse(ta.value);
          if (!v || typeof v !== 'object' || Array.isArray(v) || !v.type) throw new Error('Es muss ein Objekt mit „type“ sein.');
          const kids = node.children;
          for (const k of Object.keys(node)) delete node[k];
          Object.assign(node, v);
          if (kids) node.children = kids;
          ta.classList.remove('bad');
          commit();
        } catch (e) { ta.classList.add('bad'); toast('Kein gültiges JSON: ' + e.message); }
      },
    });
    box.append(sect('Erweitert', h('div', { class: 'note', text: 'Alle Einstellungen dieses Elements. Hier geht alles, was das Profil kann.' }), ta, h('div', null, apply)));
    refreshLive();
  }
  function emptyInspector() {
    const p = curPage();
    return h('div', { class: 'inspector-empty', html:
      `<h2>${Sx.esc(p.name || 'Seite')}</h2>` +
      `<p>Klicke ein Element auf der Fläche oder in den Ebenen an, um es zu bearbeiten.</p><br>` +
      `<p><b>Neues Element:</b> aus „Elemente“ auf die Fläche oder in eine Karte ziehen. Sensoren aus der Liste unten lassen sich ebenfalls auf die Fläche ziehen.</p><br>` +
      `<p><b>Tasten:</b> <kbd>Pfeile</kbd> verschieben (mit <kbd>Umschalt</kbd> 10 px), <kbd>Entf</kbd> löschen, <kbd>Strg+D</kbd> duplizieren, <kbd>Strg+C</kbd>/<kbd>Strg+V</kbd> kopieren, <kbd>Strg+Z</kbd> rückgängig, <kbd>Strg+S</kbd> speichern, <kbd>Esc</kbd> übergeordnetes Element.</p><br>` +
      `<p><b>Einrasten:</b> an Kanten und Mitten der Nachbarn und am Raster. <kbd>Alt</kbd> gedrückt halten = frei verschieben, <kbd>Umschalt</kbd> beim Ziehen an einer Ecke = Seitenverhältnis halten.</p>` });
  }

  // ---------------------------------------------------------------- Unterer Bereich
  function openTab(tab) {
    ed.tab = tab;
    ed.bottomMin = false;
    $('#ed-bottom').classList.remove('min');
    for (const b of document.querySelectorAll('#ed-tabs [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    renderBottom();
    setTimeout(() => { fitZoom(); drawSelection(); }, 0);
  }
  for (const b of document.querySelectorAll('#ed-tabs [data-tab]')) b.addEventListener('click', () => openTab(b.dataset.tab));
  $('#ed-collapse').innerHTML = svg('chevron');
  $('#ed-collapse').addEventListener('click', () => {
    ed.bottomMin = !ed.bottomMin;
    $('#ed-bottom').classList.toggle('min', ed.bottomMin);
    setTimeout(() => { fitZoom(); drawSelection(); }, 0);
  });
  function renderBottom() {
    const body = $('#ed-bbody');
    ed.lists.clear();
    body.textContent = '';
    if (!ed.doc) return;
    const hint = $('#ed-bhint');
    hint.textContent = '';
    if (ed.tab === 'sensors') {
      hint.textContent = 'Auf die Fläche ziehen = neues Element · Doppelklick = dem gewählten Element zuweisen';
      sensorList(body, { mode: 'dock', onPick: assignOrCreate });
    } else if (ed.tab === 'formulas') renderFormulas(body);
    else if (ed.tab === 'pages') renderPagesTab(body);
    else if (ed.tab === 'design') renderDesign(body);
  }
  function assignOrCreate(key, row) {
    const n = nodeAt(ed.sel);
    const fields = n && FIELDS[n.type];
    if (fields && fields.some(([k, , kind]) => k === 'sensor' && kind === 'sensor')) {
      n.sensor = key;
      commit();
      toast(`„${nodeName(n)}“ zeigt jetzt ${describe(key).name}.`);
    } else {
      addNode(sensorNode({ key, name: row ? row.name : key, unit: row ? (row.unit || (row.ha && row.ha.unit)) : '' }));
    }
  }

  // Formeln
  function refFor(key) { return /^[A-Za-z_][\w.]*$/.test(key) ? key : `{${key}}`; }
  function renderFormulas(body) {
    const formulas = ed.doc.formulas || (ed.doc.formulas = {});
    const list = h('div', { class: 'card-list' });
    body.append(h('div', { class: 'note', style: 'margin-bottom:10px', text: 'Formeln rechnen mit Werten: + − × ÷, Klammern und avg, min, max, sum, first, round, abs, pos. Werte mit Doppelpunkt oder Schrägstrich stehen in geschweiften Klammern, z. B. {ha:sensor.x}. Neue Formeln rechnet das Programm nach dem Speichern; „Testen“ rechnet sofort.' }));
    for (const [name, f] of Object.entries(formulas)) {
      const obj = typeof f === 'object' ? f : { expr: f };
      const nameIn = h('input', { type: 'text', value: name, spellcheck: 'false', style: 'width:150px' });
      const labelIn = h('input', { type: 'text', value: obj.label || '', placeholder: 'Beschriftung', spellcheck: 'false', style: 'width:200px' });
      const exprIn = h('input', { type: 'text', value: obj.expr || '', spellcheck: 'false' });
      const result = h('span', { class: 'result', 'data-formula': obj.expr || '' });
      const live = h('span', { class: 'result', 'data-live': name });
      const write = () => {
        const newName = nameIn.value.trim();
        if (!newName) return;
        const entries = Object.entries(formulas).map(([k, v]) => k === name ? [newName, { label: labelIn.value.trim() || undefined, expr: exprIn.value.trim() }] : [k, v]);
        ed.doc.formulas = Object.fromEntries(entries);
        commit({ bottom: true });
      };
      nameIn.addEventListener('change', write);
      labelIn.addEventListener('change', write);
      exprIn.addEventListener('change', write);
      list.append(h('div', { class: 'ecard' },
        h('label', null, 'Name', nameIn), h('label', null, 'Beschriftung', labelIn),
        h('label', { class: 'grow' }, 'Formel', h('div', { class: 'fctl' }, exprIn,
          h('button', { class: 'icon-btn', html: svg('pick'), title: 'Wert einfügen', onclick: async () => { const k = await pickSensor({ title: 'Wert in die Formel einfügen' }); if (!k) return; exprIn.value += (exprIn.value ? ' ' : '') + refFor(k); write(); } }))),
        h('label', null, 'jetzt', live),
        h('button', { class: 'mini', text: 'Testen', onclick: () => { if (!Sx.isHost) { toast('Testen geht nur im Sensorium-Programm.'); return; } result.dataset.formula = exprIn.value.trim(); result.textContent = '…'; Sx.post({ type: 'evalFormula', expr: exprIn.value.trim() }); } }),
        result,
        h('button', { class: 'mini danger', text: 'Löschen', onclick: () => { delete formulas[name]; commit({ bottom: true }); } })));
    }
    list.append(h('div', null, h('button', {
      class: 'ghost', text: '+ Neue Formel',
      onclick: () => { let i = 1; while (formulas['formel' + i]) i++; formulas['formel' + i] = { label: 'Neue Formel', expr: '' }; commit({ bottom: true }); },
    })));
    body.append(list);
    refreshLive();
    showFormulaResults();
  }
  function showFormulaResults() {
    for (const el of document.querySelectorAll('[data-formula]')) {
      const r = ed.results.get(el.dataset.formula);
      if (!r) continue;
      el.classList.toggle('bad', !!r.error);
      el.textContent = r.error ? 'Fehler: ' + r.error : r.value == null ? 'kein Wert (fehlt ein Wert?)' : '= ' + (typeof r.value === 'number' ? Sx.fmt(r.value, Math.abs(r.value) >= 100 ? 0 : 2) : String(r.value));
    }
  }

  // Seiten
  function renderPagesTab(body) {
    const list = h('div', { class: 'card-list' });
    ed.doc.pages.forEach((p, i) => {
      const inp = (key, label, width) => {
        const el = h('input', { type: 'text', value: p[key] ?? '', spellcheck: 'false', style: `width:${width}px` });
        el.addEventListener('change', () => { const t = el.value.trim(); if (t) p[key] = t; else delete p[key]; commit({ bottom: true }); });
        return h('label', null, label, el);
      };
      const ha = h('input', { type: 'checkbox' });
      ha.checked = p.requires === 'ha';
      ha.addEventListener('change', () => { if (ha.checked) p.requires = 'ha'; else delete p.requires; commit({ bottom: true }); });
      const move = d => { const j = i + d; if (j < 0 || j >= ed.doc.pages.length) return; const pages = ed.doc.pages; [pages[i], pages[j]] = [pages[j], pages[i]]; if (ed.page === i) ed.page = j; else if (ed.page === j) ed.page = i; commit({ bottom: true }); renderAll(); };
      list.append(h('div', { class: 'ecard' + (i === ed.page ? ' on' : '') },
        inp('name', 'Name', 200), inp('short', 'Name im Umschalter', 150), inp('id', 'Kennung', 120),
        h('label', { class: 'switch', style: 'flex-direction:row' }, ha, h('i'), 'braucht Home Assistant'),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'mini', text: 'Öffnen', onclick: () => setPage(i) }),
        h('button', { class: 'icon-btn', html: svg('up'), title: 'nach vorn', onclick: () => move(-1) }),
        h('button', { class: 'icon-btn', html: svg('down'), title: 'nach hinten', onclick: () => move(1) }),
        h('button', { class: 'mini', text: 'Duplizieren', onclick: () => { const c = clone(p); c.id = (p.id || 'seite') + '-kopie'; c.name = (p.name || 'Seite') + ' (Kopie)'; ed.doc.pages.splice(i + 1, 0, c); ed.page = i + 1; ed.sel = null; commit({ bottom: true }); renderAll(); } }),
        h('button', {
          class: 'mini danger', text: 'Löschen', disabled: ed.doc.pages.length < 2,
          onclick: () => { if (!confirm(`Seite „${p.name || i + 1}“ löschen?`)) return; ed.doc.pages.splice(i, 1); ed.page = Math.min(ed.page, ed.doc.pages.length - 1); ed.sel = null; commit({ bottom: true }); renderAll(); },
        })));
    });
    list.append(h('div', null, h('button', { class: 'ghost', text: '+ Neue Seite', onclick: addPage })));

    // Umschalter und automatischer Wechsel
    const sw = h('input', { type: 'checkbox' });
    sw.checked = ed.doc.switcher !== false;
    sw.addEventListener('change', () => { if (sw.checked) { if (ed.doc.switcher === false) delete ed.doc.switcher; } else ed.doc.switcher = false; commit({ bottom: true }); });
    const swY = h('input', { type: 'text', value: (ed.doc.switcher && ed.doc.switcher.y) ?? '', placeholder: String(H() - 22), style: 'width:90px' });
    swY.addEventListener('change', () => { const n = parseNum(swY.value); if (n === null) return; if (n === undefined) { if (ed.doc.switcher && typeof ed.doc.switcher === 'object') delete ed.doc.switcher.y; } else ed.doc.switcher = Object.assign(typeof ed.doc.switcher === 'object' && ed.doc.switcher ? ed.doc.switcher : {}, { y: n }); commit({ bottom: true }); });
    list.append(h('div', { class: 'ecard' }, h('label', { class: 'switch', style: 'flex-direction:row' }, sw, h('i'), 'Umschalter unten zeigen (Klick oder Mausrad)'), h('label', null, 'Höhe (y)', swY)));

    const rules = ed.doc.autoPage || [];
    const rulesBox = h('div', { class: 'ecard', style: 'flex-direction:column;align-items:stretch' }, h('div', { style: 'font-weight:600', text: 'Automatisch wechseln' }),
      h('div', { class: 'note', text: 'Sobald die Bedingung zutrifft, springt das Panel auf die Seite – zum Beispiel zur PC-Seite, wenn ein Spiel startet.' }));
    rules.forEach((r, i) => {
      const holder = { cond: r.when };
      const condRows = condToRows(r.when);
      const first = condRows[0] || { sensor: '', op: 'gt', value: '0' };
      const pageSel = h('select', { style: 'width:200px' });
      ed.doc.pages.forEach((p, k) => pageSel.append(h('option', { value: p.id || String(k), text: p.name || p.id || `Seite ${k + 1}` })));
      pageSel.value = typeof r.page === 'number' ? (ed.doc.pages[r.page] || {}).id || String(r.page) : String(r.page);
      pageSel.addEventListener('change', () => { r.page = pageSel.value; commit({ bottom: true }); });
      const op = h('select', { style: 'width:120px' });
      for (const [o, l] of OPS) op.append(h('option', { value: o, text: l }));
      op.value = first.op;
      const val = h('input', { type: 'text', value: first.value, style: 'width:110px' });
      const write = () => { r.when = rowsToCond([{ sensor: first.sensor, op: op.value, value: val.value }]) || r.when; commit({ bottom: true }); };
      op.addEventListener('change', write);
      val.addEventListener('change', write);
      const complex = condRows.length > 1 || (holder.cond && !condSimple(holder.cond));
      rulesBox.append(h('div', { class: 'lrow' },
        h('span', { style: 'flex:none;color:var(--e-muted)', text: 'Wenn' }),
        complex ? h('code', { text: JSON.stringify(r.when) }) : sensorBox(first.sensor, k => { first.sensor = k; write(); }, null, { title: 'Wert für die Bedingung' }).filter(Boolean),
        complex ? null : op, complex ? null : val,
        h('span', { style: 'flex:none;color:var(--e-muted)', text: 'dann Seite' }), pageSel,
        h('button', { class: 'icon-btn', html: svg('trash'), title: 'Entfernen', onclick: () => { rules.splice(i, 1); if (!rules.length) delete ed.doc.autoPage; commit({ bottom: true }); } })));
    });
    rulesBox.append(h('div', null, h('button', {
      class: 'mini', text: '+ Regel',
      onclick: async () => { const k = await pickSensor({ title: 'Wann soll das Panel wechseln?' }); if (!k) return; (ed.doc.autoPage || (ed.doc.autoPage = [])).push({ when: { sensor: k, gt: 0 }, page: ed.doc.pages[0].id || 0 }); commit({ bottom: true }); },
    })));
    list.append(rulesBox);
    body.append(list);
  }

  // Design
  function renderDesign(body) {
    const t = ed.doc.theme || (ed.doc.theme = {});
    const colors = t.colors || (t.colors = {});
    const NAMES = { bg: 'Hintergrund', text: 'Text', muted: 'Gedämpft', dim: 'Dunkel', line: 'Linien', track: 'Balken-Hintergrund', accent: 'Akzent', accent2: 'Akzent 2', up: 'Violett', warn: 'Warnung', crit: 'Kritisch', ok: 'Grün' };
    const grid = h('div', { class: 'form-grid', style: 'grid-template-columns:repeat(auto-fill, minmax(250px, 1fr))' });
    for (const [key, label] of Object.entries(NAMES)) {
      const v = colors[key] || getComputedStyle(document.documentElement).getPropertyValue('--' + key).trim();
      const sw = h('span', { class: 'swatch', style: `background:${v}` });
      const txt = h('input', { type: 'text', value: v, spellcheck: 'false', style: 'flex:1' });
      const pick = h('input', { type: 'color', style: 'width:40px;flex:none;padding:2px;height:30px' });
      if (/^#[0-9a-f]{6}$/i.test(v)) pick.value = v;
      const setColor = (value, live) => { colors[key] = value; sw.style.background = value; applyTheme(); if (live) liveRender(); else commit({ keepInspector: true }); };
      txt.addEventListener('change', () => setColor(txt.value.trim(), false));
      pick.addEventListener('input', () => { txt.value = pick.value; setColor(pick.value, true); });
      pick.addEventListener('change', () => setColor(pick.value, false));
      grid.append(h('div', { class: 'ecard', style: 'flex-wrap:nowrap' }, h('div', { style: 'width:110px;color:var(--e-muted)', text: label }), sw, txt, pick));
    }
    const bg = h('select');
    for (const [v, l] of [['aurora', 'Farbverlauf (Aurora)'], ['plain', 'einfarbig']]) bg.append(h('option', { value: v, text: l }));
    bg.value = t.background || 'aurora';
    bg.addEventListener('change', () => { t.background = bg.value; applyTheme(); commit({ keepInspector: true }); });
    const sizeIn = (key, label) => {
      const el = h('input', { type: 'text', value: ed.doc.canvas[key] ?? '', style: 'width:90px' });
      el.addEventListener('change', () => { const n = parseNum(el.value); if (!n || n < 200) { el.classList.add('bad'); return; } el.classList.remove('bad'); ed.doc.canvas[key] = Math.round(n); commit({ keepInspector: true }); });
      return h('label', null, label, el);
    };
    const fontIn = (key, label) => {
      const fonts = t.fonts || (t.fonts = {});
      const el = h('input', { type: 'text', value: fonts[key] || '', spellcheck: 'false', style: 'width:260px' });
      el.addEventListener('change', () => { if (el.value.trim()) fonts[key] = el.value.trim(); else delete fonts[key]; applyTheme(); commit({ keepInspector: true }); });
      return h('label', null, label, el);
    };
    body.append(h('div', { class: 'card-list', style: 'max-width:none' },
      h('div', { class: 'ecard' }, h('label', null, 'Hintergrund', bg), sizeIn('width', 'Breite (px)'), sizeIn('height', 'Höhe (px)'), fontIn('num', 'Schrift für Zahlen'), fontIn('ui', 'Schrift für Text'),
        h('div', { class: 'note', style: 'flex:1;min-width:200px', text: 'Die Größe sollte der Auflösung des Panel-Monitors entsprechen (ARZOPA: 1920 × 1080).' })),
      grid));
  }

  // ---------------------------------------------------------------- Kopfzeile: Werkzeuge
  $('#ed-undo').innerHTML = svg('undo');
  $('#ed-redo').innerHTML = svg('redo');
  $('#ed-undo').addEventListener('click', undo);
  $('#ed-redo').addEventListener('click', redo);
  $('#ed-save').addEventListener('click', save);
  $('#ed-preview').addEventListener('click', preview);
  $('#ed-grid').addEventListener('change', e => { ed.grid = +e.target.value; });
  $('#ed-zoom').addEventListener('change', e => { ed.zoom = e.target.value; fitZoom(); drawSelection(); });
  $('#ed-showall').addEventListener('change', e => { ed.showAll = e.target.checked; document.body.classList.toggle('ed-showall', ed.showAll); });
  addEventListener('resize', () => { if (ed.doc) { fitZoom(); drawSelection(); } });

  // ---------------------------------------------------------------- Nachrichten vom Programm
  Sx.on('profile', m => {
    if (!m.profile) return;
    if (!ed.doc) { load(m.profile, m.path); checkDraft(); return; }
    if (JSON.stringify(normalize(m.profile)) === ed.saved) return; // die eigene, gerade gespeicherte Fassung
    if (ed.dirty) { banner('Das Profil wurde außerhalb des Editors geändert. Dein Entwurf bleibt, beim Speichern gilt er.', []); return; }
    load(m.profile, m.path);
  });
  Sx.on('values', () => {
    if (!ed.doc) return;
    Widgets.update();
    refreshLive();
    refreshTreeVisibility();
  });
  Sx.on('catalog', () => {
    if (!ed.doc) return;
    Widgets.update();
    redrawLists();
  });
  Sx.on('haDirectory', m => {
    ed.dirLoading = false;
    if (m.error) { toast('Home Assistant: ' + m.error); redrawLists(); return; }
    ed.dir = { entities: m.entities || [], floors: m.floors || [] };
    ed.dir.entities.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    ed.dirById = new Map(ed.dir.entities.map(e => [e.id, e]));
    redrawLists();
    renderTree();
    renderInspector();
  });
  Sx.on('formulaResult', m => { ed.results.set(m.expr, m); showFormulaResults(); });
  Sx.on('saved', () => {
    ed.saved = ed.snap;
    setDirty(false);
    storeDraft();
    toast('Gespeichert. Das Panel zeigt jetzt die neue Fassung.');
  });
  Sx.on('toast', m => toast(m.message));

  // ---------------------------------------------------------------- Start
  renderPalette();
  if (Demo.active) Demo.start();
  Sx.post({ type: 'ready', page: 'editor' });
  setInterval(() => Sx.post({ type: 'heartbeat' }), 5000);
})();
