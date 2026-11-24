'use strict';
/* Sensorium – Datenkern: Verbindung zum Programm, Werte, Verlauf, Formatierung und Vorlagen. */
const Sx = (() => {
  const st = {
    values: {}, catalog: [], byId: new Map(), aliases: [], aliasByName: new Map(), status: {},
    theme: { colors: {}, gradients: {} }, locale: 'de-DE', hist: new Map(), histLen: 60,
  };
  const handlers = new Map();
  const derivers = [];
  const webview = window.chrome && window.chrome.webview;

  // ---------- Nachrichten ----------
  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  }
  function emit(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'values') {
      st.values = msg.v || {};
      // Abgeleitete Werte (z. B. Vorschau im Assistenten) kommen vor dem Verlauf dazu.
      for (const fn of derivers) { try { fn(st.values); } catch (e) { console.error(e); } }
      record();
    } else if (msg.type === 'catalog') {
      st.catalog = msg.sensors || [];
      st.byId = new Map(st.catalog.map(s => [s.id, s]));
      st.aliases = msg.aliases || [];
      st.aliasByName = new Map(st.aliases.map(a => [a.name, a]));
      st.status = msg.status || {};
    }
    for (const fn of handlers.get(msg.type) || []) {
      try { fn(msg); } catch (e) { console.error(e); }
    }
  }
  function post(msg) { if (webview) webview.postMessage(msg); }
  if (webview) webview.addEventListener('message', e => emit(e.data));

  // ---------- Werte und Verlauf ----------
  // Verlauf je Schlüssel; „key|10“ nimmt nur jeden 10. Wert auf (60 Punkte = 10 Minuten).
  let ticks = 0;
  function track(key, every = 1) {
    if (!key) return;
    const id = every > 1 ? `${key}|${every}` : key;
    if (!st.hist.has(id)) st.hist.set(id, []);
  }
  function record() {
    ticks++;
    for (const [id, arr] of st.hist) {
      const bar = id.lastIndexOf('|'), every = bar > 0 ? +id.slice(bar + 1) || 1 : 1;
      if (ticks % every) continue;
      const v = st.values[bar > 0 ? id.slice(0, bar) : id];
      arr.push(typeof v === 'number' && isFinite(v) ? v : null);
      if (arr.length > st.histLen) arr.shift();
    }
  }
  function history(key, every = 1) { track(key, every); return st.hist.get(every > 1 ? `${key}|${every}` : key); }
  const get = key => st.values[key];
  function num(key) { const v = st.values[key]; return typeof v === 'number' && isFinite(v) ? v : null; }

  // ---------- Formatierung ----------
  const formats = new Map();
  function fmt(v, d = 0) {
    if (typeof v !== 'number' || !isFinite(v)) return '–';
    const key = st.locale + '|' + d;
    let f = formats.get(key);
    if (!f) { f = new Intl.NumberFormat(st.locale, { minimumFractionDigits: d, maximumFractionDigits: d }); formats.set(key, f); }
    const p = Math.pow(10, d);
    const r = Math.round(v * p) / p;
    return f.format(r === 0 ? 0 : r);
  }
  function rate(bytesPerSecond) {
    if (typeof bytesPerSecond !== 'number' || !isFinite(bytesPerSecond)) return ['–', 'KB/s'];
    const kb = bytesPerSecond / 1024;
    if (kb < 1000) return [fmt(kb, kb < 10 ? 1 : 0), 'KB/s'];
    const mb = kb / 1024;
    if (mb < 1000) return [fmt(mb, mb < 10 ? 1 : 0), 'MB/s'];
    return [fmt(mb / 1024, 2), 'GB/s'];
  }
  function size(bytes, d) {
    if (typeof bytes !== 'number' || !isFinite(bytes)) return ['–', 'GB'];
    const gb = bytes / 1073741824;
    if (gb < 1000) return [fmt(gb, d ?? (gb < 10 ? 1 : 0)), 'GB'];
    return [fmt(gb / 1024, d ?? 2), 'TB'];
  }
  function dur(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds)) return '–';
    const s = Math.floor(seconds), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d) return `${d} d ${h} h`;
    if (h) return `${h} h ${m} min`;
    return `${m} min`;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Zustände aus Home Assistant auf Deutsch ----------
  const STATES = {
    on: 'An', off: 'Aus', home: 'Zuhause', not_home: 'Unterwegs', locked: 'Abgeschlossen', unlocked: 'Aufgeschlossen',
    locking: 'Schließt …', unlocking: 'Schließt auf …', jammed: 'Blockiert', open: 'Offen', opening: 'Öffnet …', closed: 'Geschlossen', closing: 'Schließt …',
    heat: 'Heizen', cool: 'Kühlen', auto: 'Automatik', heating: 'heizt', cooling: 'kühlt', idle: 'ruht',
    unavailable: 'nicht erreichbar', unknown: 'unbekannt', playing: 'Spielt', paused: 'Pausiert', standby: 'Standby',
    above_horizon: 'Tag', below_horizon: 'Nacht',
    sunny: 'Sonnig', 'clear-night': 'Klar', cloudy: 'Bewölkt', partlycloudy: 'Teils bewölkt', fog: 'Nebel', rainy: 'Regen', pouring: 'Starkregen',
    snowy: 'Schnee', 'snowy-rainy': 'Schneeregen', hail: 'Hagel', lightning: 'Gewitter', 'lightning-rainy': 'Gewitter', windy: 'Windig',
    'windy-variant': 'Windig', exceptional: 'Unwetter',
    running: 'Druckt', pause: 'Pausiert', prepare: 'Bereitet vor', finish: 'Fertig', failed: 'Fehlgeschlagen', offline: 'Aus', init: 'Startet', slicing: 'Bereitet vor',
  };
  function de(v) {
    if (v == null || v === '') return '–';
    if (typeof v === 'number') return fmt(v, Number.isInteger(v) ? 0 : 1);
    const s = String(v);
    return STATES[s] ?? STATES[s.toLowerCase()] ?? s;
  }

  // ---------- Zeiten: Unix-Sekunden, Millisekunden oder Text aus Home Assistant ----------
  function toDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
    const d = new Date(String(v));
    return isNaN(d) ? null : d;
  }
  const clockOf = d => d.toLocaleTimeString(st.locale, { hour: '2-digit', minute: '2-digit' });
  function when(d) {
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    if (diff === 0) return 'heute ' + clockOf(d);
    if (diff === 1) return 'gestern ' + clockOf(d);
    if (diff === -1) return 'morgen ' + clockOf(d);
    return d.toLocaleDateString(st.locale, { weekday: 'short' }).replace('.', '') + ' ' + clockOf(d);
  }
  function ago(d) {
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'gerade eben';
    if (s < 3600) return `vor ${Math.round(s / 60)} min`;
    if (s < 86400) return `vor ${Math.floor(s / 3600)} h`;
    return `vor ${Math.floor(s / 86400)} Tagen`;
  }

  // ---------- Vorlagen: {schlüssel}  {schlüssel:1}  {schlüssel|rate}  {schlüssel:0|avg}  {ha:sensor.x|de} ----------
  function tplValue(expr) {
    const bar = expr.indexOf('|');
    const main = (bar < 0 ? expr : expr.slice(0, bar)).trim(), pipe = bar < 0 ? '' : expr.slice(bar + 1).trim();
    // Nachkommastellen nur, wenn hinter dem letzten Doppelpunkt eine Zahl steht (Schlüssel wie „ha:sensor.x“ enthalten selbst einen).
    const m = /^(.*?)(?::(\d+))?$/.exec(main);
    const key = m[1], dec = m[2] != null ? parseInt(m[2], 10) : null;
    if (pipe.startsWith('map:')) {
      const v = get(key);
      for (const pair of pipe.slice(4).split(',')) {
        const eq = pair.indexOf('=');
        if (eq > 0 && pair.slice(0, eq).trim() === String(v)) return pair.slice(eq + 1).trim();
      }
      return de(v);
    }
    switch (pipe) {
      case 'de': return de(get(key));
      case 'clock': { const d = toDate(get(key)); return d ? clockOf(d) : '–'; }
      case 'when': { const d = toDate(get(key)); return d ? when(d) : '–'; }
      case 'ago': { const d = toDate(get(key)); return d ? ago(d) : '–'; }
      case 'mins': { const v = num(key); return v == null ? '–' : v < 1 ? 'unter 1 min' : dur(v * 60); }
      case 'rate': return rate(num(key)).join(' ');
      case 'size': return size(num(key), dec ?? undefined).join(' ');
      case 'dur': return dur(num(key));
      case 'avg': case 'min': case 'max': case 'avgpos': {
        // avgpos: Schnitt nur über Werte > 0 (z. B. FPS ohne die Sekunden vor dem Spielstart)
        const h = history(key).filter(x => x !== null && (pipe !== 'avgpos' || x > 0));
        if (!h.length) return '–';
        const r = pipe === 'avg' || pipe === 'avgpos' ? h.reduce((a, b) => a + b, 0) / h.length : pipe === 'min' ? Math.min(...h) : Math.max(...h);
        return fmt(r, dec ?? 0);
      }
      case 'upper': { const v = get(key); return v == null || v === '' ? '–' : String(v).toUpperCase(); }
    }
    const v = get(key);
    if (typeof v === 'number') return fmt(v, dec ?? (Number.isInteger(v) || Math.abs(v) >= 100 ? 0 : 1));
    if (Array.isArray(v)) return `${v.length} Werte`;
    if (v == null || v === '') return '–';
    return String(v);
  }
  function tpl(str, html = false) {
    if (str == null) return '';
    const s = String(str);
    if (!html) return s.replace(/\{([^{}]+)\}/g, (_, e) => tplValue(e));
    let out = '', last = 0;
    s.replace(/\{([^{}]+)\}/g, (m, e, i) => {
      out += esc(s.slice(last, i)) + '<b class="v">' + esc(tplValue(e)) + '</b>';
      last = i + m.length;
      return m;
    });
    return out + esc(s.slice(last));
  }

  // ---------- Theme ----------
  const DEFAULT_GRADIENTS = {
    accent: ['#22c3ec', '#6d8cff'], warn: ['#ffd060', '#ff8a3d'], crit: ['#ff8a96', '#ff3d6e'],
    ok: ['#5ff0b0', '#2bbf8a'], up: ['#b9a6ff', '#8a6cff'],
  };
  function setTheme(theme) {
    st.theme = Object.assign({ colors: {}, gradients: {} }, theme || {});
    st.locale = st.theme.locale || 'de-DE';
    formats.clear();
  }
  /**
   * Setzt ein Theme als CSS-Variablen und Seitenattribute (Hintergrund, Kartenstil, hell/dunkel).
   * Werte eines vorherigen Themes werden vorher entfernt, damit beim Wechsel nichts übrig bleibt.
   */
  let themeVars = [];
  function applyTheme(theme) {
    const t = theme || {};
    const root = document.documentElement.style;
    for (const name of themeVars) root.removeProperty(name);
    themeVars = [];
    const set = (name, value) => { if (value == null || value === '') return; root.setProperty(name, String(value)); themeVars.push(name); };
    for (const [name, value] of Object.entries(t.colors || {})) if (/^[a-z0-9-]+$/i.test(name)) set('--' + name, value);
    if (t.fonts) { set('--num', t.fonts.num); set('--ui', t.fonts.ui); }
    const gradients = Object.assign({}, DEFAULT_GRADIENTS, t.gradients || {});
    for (const [name, g] of Object.entries(gradients)) if (Array.isArray(g) && g.length >= 2) { set(`--g-${name}-0`, g[0]); set(`--g-${name}-1`, g[1]); }
    setTheme(Object.assign({}, t, { gradients }));
    const body = document.body;
    if (body) {
      body.dataset.bg = t.background || 'aurora';
      body.dataset.cards = t.cards || 'glass';
      body.dataset.tone = t.tone === 'light' ? 'light' : 'dark';
    }
  }
  /** Farbe für CSS: "@accent" wird zu var(--accent). */
  const color = (c, fallback) => !c ? fallback : c[0] === '@' ? `var(--${c.slice(1)})` : c;
  /** Echter Farbwert (für SVG-Attribute). */
  function colorValue(c) {
    if (!c) return colorValue('@accent');
    if (c[0] !== '@') return c;
    const name = c.slice(1);
    return st.theme.colors[name] || getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim() || '#38d2ef';
  }
  /** Verlauf [von, bis] für eine Theme-Farbe. */
  function gradient(c) {
    if (c && c[0] === '@' && st.theme.gradients[c.slice(1)]) return st.theme.gradients[c.slice(1)];
    const v = colorValue(c);
    return [v, v];
  }

  // ---------- Regeln und Bedingungen ----------
  function rule(rules, v) {
    if (!rules || typeof v !== 'number') return null;
    let hit = null;
    for (const r of rules) if (v >= r.from) hit = r;
    return hit;
  }
  function cond(c) {
    if (!c) return true;
    if (Array.isArray(c)) return c.every(cond);
    if (Array.isArray(c.any)) return c.any.some(cond);
    const v = get(c.sensor);
    if (c.exists !== undefined) return (v != null && v !== '') === !!c.exists;
    // Zustände als Text, z. B. { "sensor": "ha:binary_sensor.fenster", "eq": "on" }
    if (typeof c.eq === 'string') return v === c.eq;
    if (c.ne !== undefined) return v !== c.ne;
    if (Array.isArray(c.in)) return c.in.includes(v);
    if (Array.isArray(c.notIn)) return !c.notIn.includes(v);
    if (typeof v !== 'number') return false;
    if (c.gt !== undefined && !(v > c.gt)) return false;
    if (c.gte !== undefined && !(v >= c.gte)) return false;
    if (c.lt !== undefined && !(v < c.lt)) return false;
    if (c.lte !== undefined && !(v <= c.lte)) return false;
    if (c.eq !== undefined && v !== c.eq) return false;
    return true;
  }
  /** Sensor-ID, auf die eine Zuordnung zeigt (nur bei einfachen Zuordnungen wie "{id}"). */
  function aliasTarget(name) {
    const a = st.aliasByName.get(name);
    if (!a || !a.expr) return null;
    const m = /^\{([^{}]+)\}$/.exec(a.expr.trim());
    return m ? m[1] : null;
  }

  const derive = fn => derivers.push(fn);

  /** JSON wie von Hand geschrieben: kurze Objekte in einer Zeile (für gespeicherte Profile). */
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
  return { st, on, emit, post, derive, toJson, track, history, get, num, fmt, rate, size, dur, esc, tpl, de, toDate, clockOf, setTheme, applyTheme, DEFAULT_GRADIENTS, color, colorValue, gradient, rule, cond, aliasTarget, isHost: !!webview };
})();
