'use strict';
/* Sensorium – Bausteine des Panels. Jedes Element bekommt seine Einstellungen aus dem Profil. */
const Widgets = (() => {
  const factories = {};
  let instances = [];
  const SVG = 'http://www.w3.org/2000/svg';
  let counter = 0;
  const uid = prefix => `${prefix}${++counter}`;

  // ---------- Hilfen ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids) if (kid != null) el.append(kid);
    return el;
  }
  function s(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
    return el;
  }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function setHTML(el, t) { if (el._html !== t) { el._html = t; el.innerHTML = t; } }
  function hexA(col, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(col || '');
    if (!m) return col;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const clamp01 = x => Math.max(0, Math.min(1, x));

  const ICONS = {
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    cloud: '<path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 9.2 4.4 4.4 0 0 0 7 18z"/>',
    therm: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
    fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 3 2 2 4-1 2-3 3-6 3z"/><path d="M14 12c4 0 7 1 7 4 0 2-2 3-4 2-2-1-3-3-3-6z"/><path d="M12 14c0 4-1 7-4 7-2 0-3-2-2-4 1-2 3-3 6-3z"/><path d="M10 12c-4 0-7-1-7-4 0-2 2-3 4-2 2 1 3 3 3 6z"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
    plug: '<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5V21"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    gamepad: '<path d="M6 9h12a4 4 0 0 1 3.9 4.9l-.8 3.4A2.5 2.5 0 0 1 16.8 18l-2.3-2.5h-5L7.2 18a2.5 2.5 0 0 1-4.3-.7l-.8-3.4A4 4 0 0 1 6 9z"/><path d="M8 11.5v3M6.5 13h3M16 12.5h.01M18 14h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    partly: '<path d="M8.6 8.2a3.6 3.6 0 0 1 6.2-2"/><path d="M8.5 2.8v1.2M3.9 4.7l.9.9M2.5 9.2h1.2"/><path d="M8.5 20h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.4 12.4 3.8 3.8 0 0 0 8.5 20z"/>',
    rain: '<path d="M7 15h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 6.2 4.4 4.4 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
    snow: '<path d="M7 14h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 5.2 4.4 4.4 0 0 0 7 14z"/><path d="M8 18h.01M12 19h.01M16 18h.01M10 21.2h.01M14 21.2h.01"/>',
    fog: '<path d="M4 8h16M3 12h18M6 16h12M8 20h8"/>',
    storm: '<path d="M7 14h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.3 5.2 4.4 4.4 0 0 0 7 14z"/><path d="M12.5 14l-2 4h3l-2 4"/>',
    wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>',
    window: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M12 3.5v17M4.5 12h15"/>',
    car: '<path d="M5 16h14M6.5 16v2.5M17.5 16v2.5"/><path d="M3.5 13l1.8-5a2 2 0 0 1 1.9-1.3h9.6a2 2 0 0 1 1.9 1.3l1.8 5v3h-17z"/><circle cx="7.5" cy="13" r=".8"/><circle cx="16.5" cy="13" r=".8"/>',
    wash: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="12" cy="13" r="4.5"/><path d="M7.5 6.5h.01M10.5 6.5h3"/>',
    dish: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M4 8h16M8 13c1.5-1 2.5 1 4 0s2.5 1 4 0M8 16.5c1.5-1 2.5 1 4 0s2.5 1 4 0"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.8 4.2-8.8.4 1.9 1.4 3.1 2.6 3.8.3-2.6 1.4-4.9 3.2-6.8.3 3.3 3 6 3 10 0 4.3-2.8 8-6.5 8z"/>',
    click: '<path d="M9 9l10 4-4 1.5L13.5 19z"/><path d="M5.5 5.5l1.6 1.6M10 3.5v2.2M3.5 10h2.2"/>',
    printer: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 8h17M11 8v3l1 1.5 1-1.5V8M7 17h10M9.5 17v-2.5h5V17"/>',
  };
  // Wetterlage aus Home Assistant → Symbol
  const WX = {
    sunny: 'sun', 'clear-night': 'moon', partlycloudy: 'partly', cloudy: 'cloud', fog: 'fog', rainy: 'rain', pouring: 'rain',
    snowy: 'snow', 'snowy-rainy': 'snow', hail: 'snow', lightning: 'storm', 'lightning-rainy': 'storm', windy: 'wind', 'windy-variant': 'wind', exceptional: 'storm',
  };
  function icon(name, size = 20, style = '') {
    const el = s('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ico' });
    el.innerHTML = ICONS[name] || '';
    if (style) el.style.cssText = style;
    return el;
  }

  function font(el, c, defaults) {
    const o = Object.assign({}, defaults || {}, c);
    const st = el.style;
    if (o.size) st.fontSize = o.size + 'px';
    if (o.font === 'num') { st.fontFamily = 'var(--num)'; st.fontVariantNumeric = 'tabular-nums'; }
    else if (o.font === 'ui') st.fontFamily = 'var(--ui)';
    if (o.weight) st.fontWeight = o.weight;
    if (o.color) st.color = Sx.color(o.color);
    if (o.align) st.textAlign = o.align;
    if (o.upper) st.textTransform = 'uppercase';
    if (o.spacing != null) st.letterSpacing = o.spacing + 'em';
    if (o.lineHeight) st.lineHeight = o.lineHeight;
  }

  // ---------- Verwaltung ----------
  function define(type, factory) { factories[type] = factory; }
  function place(el, c) {
    const st = el.style;
    st.left = (c.x || 0) + 'px';
    st.top = (c.y || 0) + 'px';
    if (c.w != null) st.width = c.w + 'px';
    if (c.h != null) st.height = c.h + 'px';
    if (c.z != null) st.zIndex = c.z;
    if (c.opacity != null) st.opacity = c.opacity;
  }
  function mount(cfg, parent) {
    const el = h('div', { class: 'w w-' + cfg.type });
    el._cfg = cfg; // für den Editor: Element → Einstellungen
    place(el, cfg);
    parent.append(el);
    const factory = factories[cfg.type];
    if (!factory) {
      el.classList.add('w-unknown');
      el.textContent = 'Unbekanntes Element: ' + cfg.type;
      return null;
    }
    let inst;
    try { inst = factory(cfg, el) || {}; }
    catch (e) {
      console.error(e);
      el.classList.add('w-unknown');
      el.textContent = `Fehler in „${cfg.type}“: ${e.message}`;
      return null;
    }
    inst.cfg = cfg;
    inst.el = el;
    instances.push(inst);
    for (const child of cfg.children || []) mount(child, inst.content || el);
    return inst;
  }
  function reset() {
    for (const i of instances) if (i.destroy) { try { i.destroy(); } catch (e) { console.error(e); } }
    instances = [];
  }
  function update() {
    for (const i of instances) {
      const c = i.cfg;
      if (c.visibleIf || c.hiddenIf) {
        const visible = (!c.visibleIf || Sx.cond(c.visibleIf)) && !(c.hiddenIf && Sx.cond(c.hiddenIf));
        i.el.classList.toggle('is-hidden', !visible);
      }
      if (i.update) { try { i.update(); } catch (e) { console.error(c.type, e); } }
    }
  }

  // ---------- Gemeinsame Logik für Werte ----------
  function readValue(c) {
    let v = Sx.num(c.sensor);
    if (v != null && c.scale) v *= c.scale;
    if (v != null && c.abs) v = Math.abs(v); // ohne Vorzeichen, z. B. Einspeisung statt negativem Bezug
    return v;
  }
  function formatValue(c, v) {
    if (c.format === 'rate') return Sx.rate(v);
    if (c.format === 'size') return Sx.size(v, c.decimals);
    return [Sx.fmt(v, c.decimals ?? 0), c.unit || ''];
  }
  function applyRule(target, el, c, v) {
    const r = Sx.rule(c.rules, v);
    target.style.color = r ? Sx.color(r.color) : (c.color ? Sx.color(c.color) : '');
    el.classList.toggle('pulse', !!(r && r.pulse));
  }
  function maxOf(c, fallback) {
    if (typeof c.max === 'string') { const m = Sx.num(c.max); return m == null ? null : m * (c.maxScale || 1); }
    return c.max || fallback;
  }

  function sparkline(c, w, hgt) {
    const every = c.every || 1; // nur jeden n-ten Wert aufnehmen: längerer Zeitraum mit 60 Punkten
    Sx.track(c.sensor, every);
    const col = Sx.colorValue(c.color || '@accent');
    const id = uid('sg');
    const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, class: 'spark' });
    const defs = s('defs');
    const lg = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(s('stop', { offset: 0, 'stop-color': col, 'stop-opacity': c.fill ?? 0.32 }), s('stop', { offset: 1, 'stop-color': col, 'stop-opacity': 0 }));
    defs.append(lg);
    svg.append(defs);
    if (c.grid) for (const f of [0.25, 0.5, 0.75]) svg.append(s('line', { x1: 0, x2: w, y1: hgt * f, y2: hgt * f, class: 'grid' }));
    svg.append(s('line', { x1: 0, x2: w, y1: hgt - 0.5, y2: hgt - 0.5, class: 'base' }));
    const zero = s('line', { x1: 0, x2: w, y1: 0, y2: 0, class: 'zero' }); // Nulllinie, wenn Werte negativ werden können
    zero.style.display = 'none';
    svg.append(zero);
    const area = s('path', { fill: `url(#${id})` });
    const line = s('path', { fill: 'none', stroke: col, 'stroke-width': c.stroke || 1.7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const dot = s('circle', { r: 0, fill: col });
    dot.style.filter = `drop-shadow(0 0 5px ${col})`;
    svg.append(area, line, dot);
    return {
      svg,
      update() {
        const scale = c.scale || 1, len = Sx.st.histLen;
        const vals = Sx.history(c.sensor, every).map(v => v == null ? null : v * scale);
        const known = vals.filter(v => v != null);
        if (known.length < 2) { area.setAttribute('d', ''); line.setAttribute('d', ''); dot.setAttribute('r', 0); return; }
        let max = maxOf(c, 0), min = typeof c.min === 'number' ? c.min : 0;
        if (c.min === 'auto') {
          // Werte können negativ sein (z. B. Einspeisung): Bereich um die Null herum wählen.
          const lo = Math.min(0, ...known), hi = Math.max(0, ...known), pad = (hi - lo) * 0.2 || 1;
          min = lo < 0 ? lo - pad / 2 : 0;
          if (!max) max = hi > 0 ? hi + pad : pad / 2;
        }
        if (!max) max = Math.max(...known) * 1.25 || 1;
        const span = (max - min) || 1, offset = len - vals.length;
        const yOf = v => hgt - 1.5 - clamp01((v - min) / span) * (hgt - 5);
        const base = min < 0 ? yOf(0) : hgt;
        zero.style.display = min < 0 ? '' : 'none';
        zero.setAttribute('y1', base.toFixed(1));
        zero.setAttribute('y2', base.toFixed(1));
        let d = '', first = null, last = null;
        vals.forEach((v, i) => {
          if (v == null) return;
          const x = (offset + i) * w / (len - 1);
          const y = yOf(v);
          d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
          if (first == null) first = x;
          last = [x, y];
        });
        line.setAttribute('d', d);
        area.setAttribute('d', `${d}L${last[0].toFixed(1)} ${base.toFixed(1)}L${first.toFixed(1)} ${base.toFixed(1)}Z`);
        dot.setAttribute('r', 3.2);
        dot.setAttribute('cx', last[0].toFixed(1));
        dot.setAttribute('cy', last[1].toFixed(1));
      },
    };
  }

  // ---------- Bausteine ----------

  /** Karte mit Überschrift, Zusatzinfo, Titel, Chips und Trennlinie. Kinder liegen relativ zur Karte. */
  define('card', (c, el) => {
    el.classList.add('card');
    if (c.background) el.style.background = c.background;
    const parts = {};
    if (c.label) el.append(h('div', { class: 'hd', style: c.color ? `color:${Sx.color(c.color)}` : null, text: c.label }));
    if (c.meta) el.append(parts.meta = h('div', { class: 'meta' }));
    if (c.title) el.append(parts.title = h('div', { class: 'title' }));
    if (c.chips && c.chips.length) {
      parts.chips = c.chips.map(() => h('span', { class: 'chip' }));
      el.append(h('div', { class: 'chips' }, ...parts.chips));
    }
    if (c.divider) el.append(h('div', { class: 'divider', style: `top:${c.divider === true ? 108 : c.divider}px` }));
    return {
      update() {
        if (parts.meta) setText(parts.meta, Sx.tpl(c.meta));
        if (parts.title) setText(parts.title, Sx.tpl(c.title));
        if (parts.chips) parts.chips.forEach((chip, i) => setText(chip, Sx.tpl(c.chips[i])));
      },
    };
  });

  /** Unsichtbarer Container, z. B. für Bereiche, die nur unter einer Bedingung erscheinen. */
  define('group', () => ({}));

  /** Überschrift im Karten-Stil (Akzentstrich + Großbuchstaben). */
  define('header', (c, el) => {
    el.append(h('div', { class: 'hd', style: c.color ? `color:${Sx.color(c.color)}` : null, text: c.text || '' }));
  });

  /** Freier Text mit Platzhaltern wie {cpu.temp:0}. emph: Werte hervorheben. */
  define('text', (c, el) => {
    el.classList.add('txt');
    font(el, c, { size: 14, color: '@muted' });
    if (!/\{[^{}]+\}/.test(c.text || '')) { el.textContent = c.text || ''; return {}; }
    return { update() { if (c.emph) setHTML(el, Sx.tpl(c.text, true)); else setText(el, Sx.tpl(c.text)); } };
  });

  /** Kleine Beschriftung in Großbuchstaben, optional mit Symbol. */
  define('label', (c, el) => {
    el.classList.add('lblw');
    if (c.align === 'right') el.style.justifyContent = 'flex-end';
    if (c.color) el.style.color = Sx.color(c.color);
    if (c.icon) el.append(icon(c.icon, 16));
    const t = h('span', { class: 'lbl', style: c.color ? 'color:inherit' : null, text: c.text || '' });
    el.append(t);
    return /\{/.test(c.text || '') ? { update() { setText(t, Sx.tpl(c.text)); } } : {};
  });

  /** Uhrzeit oder Datum. show: "time" | "date". */
  define('clock', (c, el) => {
    el.classList.add('txt');
    font(el, c, c.show === 'date' ? { size: 17, color: '@muted' } : { size: 94, font: 'num', weight: 300, lineHeight: 1.05 });
    const tick = () => {
      const d = new Date(), loc = Sx.st.locale;
      const text = c.show === 'date'
        ? (c.format === 'short' ? d.toLocaleDateString(loc) : d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
        : d.toLocaleTimeString(loc, c.seconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
      setText(el, text);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return { destroy() { clearInterval(timer); } };
  });

  /** Großer Zahlenwert mit Einheit. format: "rate" (B/s) oder "size" (Bytes) wählen die Einheit selbst. */
  define('value', (c, el) => {
    el.classList.add('val');
    el.style.textAlign = c.align || 'left';
    const n = h('span', { class: 'n', style: `font-size:${c.size || 36}px` });
    const u = h('span', { class: 'u', style: `font-size:${c.unitSize || Math.round((c.size || 36) * 0.48)}px;margin-left:${c.unitGap ?? 6}px` });
    el.append(n, u);
    return {
      update() {
        const v = readValue(c);
        const [text, unit] = formatValue(c, v);
        setText(n, text);
        setText(u, unit);
        applyRule(n, el, c, v);
      },
    };
  });

  /** Verlaufskurve der letzten 60 Werte. max: Zahl, Sensorname oder leer (automatisch). */
  define('spark', (c, el) => {
    const sp = sparkline(c, c.w, c.h);
    el.append(sp.svg);
    return { update: sp.update };
  });

  /** Messzeile: Beschriftung links, Wert rechts, Verlaufskurve darunter. */
  define('metric', (c, el) => {
    el.classList.add('metric');
    const lbl = h('div', { class: 'lbl m-lbl', text: c.label || '' });
    let badge = null;
    if (c.badge) { badge = h('span', { class: 'badge', text: c.badge.text || '' }); lbl.append(badge); }
    const n = h('span', { class: 'n', style: `font-size:${c.size || 36}px` });
    const u = h('span', { class: 'u', style: `font-size:${c.unitSize || 19}px;margin-left:7px`, text: c.unit || '' });
    const sp = sparkline(Object.assign({ color: '@accent' }, c), c.w, c.sparkH || 30);
    sp.svg.classList.add('m-spark');
    sp.svg.style.top = (c.sparkY ?? 42) + 'px';
    el.append(lbl, h('div', { class: 'm-val' }, n, u), sp.svg);
    return {
      update() {
        const v = readValue(c);
        const [text, unit] = formatValue(c, v);
        setText(n, text);
        if (c.format) setText(u, unit);
        applyRule(n, el, c, v);
        if (badge) badge.style.display = Sx.cond(c.badge.if) ? '' : 'none';
        sp.update();
      },
    };
  });

  /** Bogenanzeige (270°) mit Skala, Farbzonen aus den Regeln und Min/Max seit Start. */
  define('gauge', (c, el) => {
    const W = 380, H = 330, cx = 190, cy = 172, r = 120;
    const min = c.min ?? 0, max = c.max ?? 100, span = (max - min) || 1;
    const rad = deg => deg * Math.PI / 180;
    const pt = (a, rr) => [cx + rr * Math.cos(rad(a)), cy + rr * Math.sin(rad(a))];
    const arc = rr => { const a = pt(135, rr), b = pt(45, rr); return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}A${rr} ${rr} 0 1 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}`; };
    const rules = c.rules || [];
    const colors = [c.color || '@accent', ...rules.map(x => x.color || '@warn')];
    const unit = c.unit ?? '°C';

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: c.w || W, height: c.h || H, class: 'gauge' });
    const defs = s('defs');
    const gradIds = colors.map(col => {
      const id = uid('gg'), [a, b] = Sx.gradient(col);
      const lg = s('linearGradient', { id, x1: 0, y1: 1, x2: 1, y2: 0 });
      lg.append(s('stop', { offset: 0, 'stop-color': a }), s('stop', { offset: 1, 'stop-color': b }));
      defs.append(lg);
      return id;
    });
    svg.append(defs);

    if (c.ticks !== false) {
      const ticks = s('g', { class: 'ticks' });
      for (let i = 0; i <= 40; i++) {
        const a = 135 + 270 * i / 40, major = i % 5 === 0, p1 = pt(a, major ? r + 21 : r + 24), p2 = pt(a, r + 30);
        ticks.append(s('line', { x1: p1[0].toFixed(1), y1: p1[1].toFixed(1), x2: p2[0].toFixed(1), y2: p2[1].toFixed(1), class: major ? 'major' : 'minor' }));
      }
      svg.append(ticks);
    }
    const zoneArc = arc(r + 15);
    const bounds = [min, ...rules.map(x => x.from), max].map(v => clamp01((v - min) / span) * 100);
    for (let z = 0; z < bounds.length - 1; z++) {
      const a = bounds[z], b = bounds[z + 1];
      if (b <= a) continue;
      svg.append(s('path', { d: zoneArc, pathLength: 100, fill: 'none', stroke: Sx.colorValue(colors[z]), 'stroke-width': 3, 'stroke-dasharray': `0 ${a} ${b - a} 100`, opacity: z === 0 ? 0.35 : 0.65 }));
    }
    svg.append(s('path', { d: arc(r), fill: 'none', class: 'track', 'stroke-width': 18, 'stroke-linecap': 'round' }));
    const valueArc = s('path', { d: arc(r), pathLength: 100, fill: 'none', stroke: `url(#${gradIds[0]})`, 'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-dasharray': '0 100', class: 'g-arc' });
    svg.append(valueArc);
    const knobGroup = s('g', { class: 'g-knob' });
    knobGroup.style.transformOrigin = `${cx}px ${cy}px`;
    const start = pt(135, r);
    const knob = s('circle', { cx: start[0].toFixed(1), cy: start[1].toFixed(1), r: 6, fill: Sx.colorValue('@text') });
    knobGroup.append(knob);
    svg.append(knobGroup);

    const text = s('text', { x: cx, y: cy + 30, 'text-anchor': 'middle', class: 'g-val' });
    const tv = s('tspan', { 'font-size': c.size || 108 });
    const tu = s('tspan', { 'font-size': 30, dx: 4, dy: -58, class: 'g-unit' });
    tu.textContent = unit;
    text.append(tv, tu);
    const label = s('text', { x: cx, y: cy + 66, 'text-anchor': 'middle', class: 'g-lbl' });
    label.textContent = (c.label || '').toUpperCase();
    const minmax = s('text', { x: cx, y: cy + 132, 'text-anchor': 'middle', class: 'g-mm' });
    svg.append(text, label);
    if (c.minmax !== false) svg.append(minmax);
    el.append(svg);

    let lo = null, hi = null;
    return {
      update() {
        const v = readValue(c);
        const f = v == null ? 0 : clamp01((v - min) / span);
        valueArc.style.strokeDasharray = `${(f * 100).toFixed(2)} 100`;
        knobGroup.style.transform = `rotate(${(f * 270).toFixed(2)}deg)`;
        knob.style.opacity = v == null ? 0 : 1;
        let zone = 0;
        rules.forEach((x, i) => { if (v != null && v >= x.from) zone = i + 1; });
        valueArc.setAttribute('stroke', `url(#${gradIds[zone]})`);
        const glow = Sx.gradient(colors[zone])[0];
        valueArc.style.filter = `drop-shadow(0 0 9px ${hexA(glow, 0.6)})`;
        knob.style.filter = `drop-shadow(0 0 6px ${hexA(glow, 0.7)})`;
        tv.textContent = Sx.fmt(v, c.decimals ?? 0);
        tu.style.visibility = v == null ? 'hidden' : '';
        tv.style.fill = zone ? glow : '';
        el.classList.toggle('pulse', !!(zone && rules[zone - 1].pulse));
        if (v != null) { lo = lo == null ? v : Math.min(lo, v); hi = hi == null ? v : Math.max(hi, v); }
        minmax.textContent = lo == null ? '' : `Min ${Sx.fmt(lo, c.decimals ?? 0)} ${unit} · Max ${Sx.fmt(hi, c.decimals ?? 0)} ${unit}`;
      },
    };
  });

  /** Ring mit Prozentwert in der Mitte. */
  define('ring', (c, el) => {
    const svg = s('svg', { viewBox: '0 0 180 180', width: c.w || 180, height: c.h || 180, class: 'ring' });
    const id = uid('rg'), [a, b] = Sx.gradient(c.color || '@accent');
    const defs = s('defs'), lg = s('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 });
    lg.append(s('stop', { offset: 0, 'stop-color': a }), s('stop', { offset: 1, 'stop-color': b }));
    defs.append(lg);
    svg.append(defs, s('circle', { cx: 90, cy: 90, r: 72, fill: 'none', class: 'track', 'stroke-width': 14 }));
    const ring = s('circle', { cx: 90, cy: 90, r: 72, fill: 'none', stroke: `url(#${id})`, 'stroke-width': 14, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '0 100', transform: 'rotate(-90 90 90)', class: 'r-arc' });
    ring.style.filter = `drop-shadow(0 0 6px ${hexA(a, 0.5)})`;
    const text = s('text', { x: 90, y: 100, 'text-anchor': 'middle', class: 'r-val' });
    const tv = s('tspan', { 'font-size': 50 }), tu = s('tspan', { 'font-size': 22, dx: 2, class: 'r-unit' });
    tu.textContent = c.unit ?? '%';
    text.append(tv, tu);
    const label = s('text', { x: 90, y: 126, 'text-anchor': 'middle', class: 'r-lbl' });
    label.textContent = (c.label || '').toUpperCase();
    svg.append(ring, text, label);
    el.append(svg);
    return {
      update() {
        const v = readValue(c), m = maxOf(c, 100);
        const f = v == null || !m ? 0 : clamp01(v / m);
        ring.style.strokeDasharray = `${(f * 100).toFixed(2)} 100`;
        tv.textContent = Sx.fmt(v, c.decimals ?? 0);
      },
    };
  });

  /** Waagerechter Balken. max: Zahl oder Sensorname. marker: Strich bei einem Wert (Zahl oder Sensor), z. B. Ladelimit. */
  define('bar', (c, el) => {
    const height = c.h || 8;
    let track = el, mark = null;
    if (c.marker != null) {
      track = h('div', { class: 'bar', style: `height:${height}px` });
      mark = h('b', { class: 'bar-mark', style: `height:${height + 8}px;top:-4px` });
      el.append(track, mark);
    } else {
      el.classList.add('bar');
    }
    track.style.borderRadius = height / 2 + 'px';
    const fill = h('i');
    track.append(fill);
    return {
      update() {
        const v = readValue(c), m = maxOf(c, 100);
        const f = v == null || !m ? 0 : clamp01(v / m);
        fill.style.width = (f * 100).toFixed(1) + '%';
        if (mark) {
          const mv = typeof c.marker === 'number' ? c.marker : Sx.num(c.marker);
          mark.style.display = mv == null || !m ? 'none' : '';
          if (mv != null && m) mark.style.left = (clamp01(mv / m) * 100).toFixed(1) + '%';
        }
        const r = Sx.rule(c.rules, c.rulesOnPercent ? f * 100 : v);
        const g = Sx.gradient(r ? r.color : (c.color || '@accent'));
        fill.style.background = `linear-gradient(90deg, ${g[0]}, ${g[1]})`;
        fill.style.boxShadow = `0 0 12px ${hexA(g[0], 0.55)}`;
      },
    };
  });

  /** Ein Balken pro CPU-Thread (Sensor liefert eine Liste). */
  define('threads', (c, el) => {
    el.classList.add('threads');
    let bars = [];
    const warnAt = c.warnAt ?? 85;
    return {
      update() {
        const raw = Sx.get(c.sensor), list = Array.isArray(raw) ? raw : [];
        if (bars.length !== list.length) {
          el.textContent = '';
          bars = list.map(() => { const fill = h('i'); el.append(h('div', { class: 'th' }, fill)); return fill; });
        }
        list.forEach((v, i) => {
          const p = typeof v === 'number' ? Math.max(4, Math.min(100, v)) : 0;
          bars[i].style.height = p.toFixed(0) + '%';
          bars[i].classList.toggle('hot', typeof v === 'number' && v >= warnAt);
        });
      },
    };
  });

  /** Zeile „Bezeichnung … Wert Einheit“. */
  define('kv', (c, el) => {
    el.classList.add('kv');
    const n = h('span', { class: 'n', style: `font-size:${c.size || 24}px` });
    const u = h('span', { class: 'u', style: `font-size:${c.unitSize || 15}px;margin-left:5px`, text: c.unit || '' });
    el.append(h('span', { class: 'k', text: c.label || '' }), h('span', null, n, u));
    return { update() { setText(n, c.sensor ? Sx.fmt(readValue(c), c.decimals ?? 1) : Sx.tpl(c.text)); } };
  });

  /** Kleine Kennzahl: Beschriftung oben, Zahl darunter. */
  define('stat', (c, el) => {
    el.classList.add('stat');
    if (c.align) el.style.textAlign = c.align;
    const n = h('span', { class: 'n', style: `font-size:${c.size || 30}px` });
    const u = h('span', { class: 'u', style: `font-size:${c.unitSize || 16}px;margin-left:4px`, text: c.unit || '' });
    el.append(h('div', { class: 'lbl', text: c.label || '' }), h('div', { class: 'stat-v' }, n, u));
    return {
      update() {
        if (c.sensor) { const v = readValue(c); setText(n, Sx.fmt(v, c.decimals ?? 0)); applyRule(n, el, c, v); }
        else setText(n, Sx.tpl(c.text));
      },
    };
  });

  /** Laufwerkszeile: Buchstabe, Modell, Temperatur, Belegung, Lesen/Schreiben. */
  define('drive', (c, el) => {
    el.classList.add('drive');
    // "C" = Laufwerk C:, "#2" = das zweite Laufwerk, das Windows meldet (passt auf jedem PC).
    const want = String(c.letter || 'C').toUpperCase();
    const pick = () => {
      if (!want.startsWith('#')) return want;
      const letters = Object.keys(Sx.st.values).map(k => /^sys\.drive\.([A-Z])\.total$/.exec(k)).filter(Boolean).map(m => m[1]).sort();
      return letters[(+want.slice(1) || 1) - 1] || want;
    };
    let L = pick(), p = `sys.drive.${L}.`;
    const sub = h('span', { class: 'd-sub' });
    const temp = h('span', { class: 'chip d-temp' });
    const pct = h('span', { class: 'n d-pct' });
    const fill = h('i');
    const used = h('span', { class: 'd-used' });
    const read = h('b', { class: 'n' }), write = h('b', { class: 'n' });
    const letterEl = h('span', { class: 'n d-letter', text: (want.startsWith('#') ? '–' : L) + ':' });
    // "io": false blendet Lesen/Schreiben aus (für schmale Karten).
    const io = c.io === false ? null : h('span', { class: 'd-io' }, icon('down', 14, 'color:var(--accent)'), h('span', { text: 'Lesen' }), read,
      icon('up', 14, 'color:var(--up);margin-left:22px'), h('span', { text: 'Schreiben' }), write);
    el.append(
      h('div', { class: 'd-row1' }, letterEl, sub, temp,
        h('span', { class: 'd-pctwrap' }, pct, h('span', { class: 'u', text: '%', style: 'font-size:18px;margin-left:3px' }))),
      h('div', { class: 'bar d-bar' }, fill),
      h('div', { class: 'd-row3' }, used, io));
    const tempRules = c.tempRules || [{ from: 50, color: '@warn' }, { from: 65, color: '@crit' }];
    return {
      update() {
        if (want.startsWith('#')) {
          L = pick();
          p = `sys.drive.${L}.`;
          setText(letterEl, (L.startsWith('#') ? '–' : L) + ':');
        }
        const total = Sx.num(p + 'total');
        if (total == null) { setText(sub, 'nicht gefunden'); setText(pct, '–'); fill.style.width = '0'; temp.style.display = 'none'; return; }
        setText(sub, Sx.tpl(c.sub || `{drive.${L}.model}`));
        const t = Sx.num(`drive.${L}.temp`);
        temp.style.display = t == null ? 'none' : '';
        setText(temp, `${Sx.fmt(t)} °C`);
        const r = Sx.rule(tempRules, t);
        temp.style.color = r ? Sx.color(r.color) : '';
        const percent = Sx.num(p + 'pct');
        setText(pct, Sx.fmt(percent));
        fill.style.width = `${(clamp01((percent || 0) / 100) * 100).toFixed(1)}%`;
        const [totalText, unit] = Sx.size(total);
        const usedBytes = Sx.num(p + 'used') || 0;
        const usedText = unit === 'TB' ? Sx.fmt(usedBytes / 1099511627776, 2) : Sx.fmt(usedBytes / 1073741824, 0);
        setText(used, `${usedText} von ${totalText} ${unit} belegt`);
        setText(read, Sx.rate(Sx.num(p + 'read')).join(' '));
        setText(write, Sx.rate(Sx.num(p + 'write')).join(' '));
      },
    };
  });

  /**
   * Kühlung automatisch aus der Sensorliste: Kühlmittel, Pumpe und Lüfter einer AIO (per USB)
   * sowie Lüfter am Mainboard. Meldet eine AIO ihre Pumpe selbst, werden Mainboard-Anschlüsse über
   * 1800 RPM ausgeblendet – dort hängt dann nur das Ersatzsignal der Pumpe.
   */
  define('fanlist', (c, el) => {
    el.classList.add('fanlist');
    el.style.gridTemplateColumns = `repeat(${c.columns || 2}, 1fr)`;
    const types = c.hwTypes || ['Cooler', 'SuperIO', 'Motherboard', 'EmbeddedController'];
    const isCooler = x => x.hwType === 'Cooler';
    const rank = x => isCooler(x) ? (x.type === 'Temperature' ? 0 : /pump/i.test(x.name) ? 1 : 2) : 3;
    let key = null, cells = [];
    const emptyText = () => {
      const st = Sx.st.status || {};
      if (st.pawnio === false) return 'Lüfter und Pumpe brauchen den PawnIO-Treiber.';
      if (st.elevated === false) return 'Lüfter und Pumpe brauchen Adminrechte.';
      return c.empty || 'Keine Lüfter gefunden.';
    };
    return {
      update() {
        const catalog = Sx.st.catalog;
        const pump = Sx.aliasTarget('cpu.pump');
        const coolerPump = catalog.some(x => isCooler(x) && x.type === 'Fan' && /pump/i.test(x.name) && Sx.num(x.id) != null);
        const items = catalog
          .filter(x => types.includes(x.hwType) && (x.type === 'Fan' || (c.temps !== false && isCooler(x) && x.type === 'Temperature')))
          .filter(x => {
            const v = Sx.num(x.id);
            if (v == null) return false;
            if (x.type === 'Fan' && c.hideZero && v <= 0) return false;
            if (coolerPump && !isCooler(x) && x.type === 'Fan' && v > 1800) return false;
            return true;
          })
          .sort((a, b) => rank(a) - rank(b))
          .slice(0, c.max || 6);
        const next = items.map(f => f.id).join('|') + '#' + emptyText();
        if (next !== key) {
          key = next;
          el.textContent = '';
          cells = [];
          if (!items.length) el.append(h('div', { class: 'fl-empty', text: emptyText() }));
          for (const item of items) {
            const temp = item.type === 'Temperature';
            const name = (c.names && c.names[item.name]) || (item.id === pump ? 'Pumpe' : item.name);
            const n = h('span', { class: 'n' }), fill = h('i');
            el.append(h('div', { class: 'fl-cell' },
              h('div', { class: 'fl-top' }, h('span', { class: 'fl-name', text: name }),
                h('span', null, n, h('span', { class: 'u', text: temp ? ' °C' : ' RPM', style: 'font-size:14px' }))),
              h('div', { class: 'bar fl-bar' }, fill)));
            cells.push({ id: item.id, temp, n, fill });
          }
        }
        for (const cell of cells) {
          const v = Sx.num(cell.id);
          setText(cell.n, Sx.fmt(v, cell.temp ? 1 : 0));
          const f = cell.temp ? ((v || 0) - 15) / 35 : (v || 0) / (c.maxRpm || 3000);
          cell.fill.style.width = `${(clamp01(f) * 100).toFixed(1)}%`;
          if (cell.temp) {
            const g = Sx.gradient((v || 0) >= (c.liquidWarn || 40) ? '@warn' : '@accent');
            cell.fill.style.background = `linear-gradient(90deg, ${g[0]}, ${g[1]})`;
          }
        }
      },
    };
  });

  /**
   * Ampel: fasst Grenzwerte zusammen („Alles normal“, „CPU-Temperatur erhöht“ …).
   * Prüfungen: { sensor, warn, crit, label } für Zahlen oder { sensor, is, text } bzw. { when, text, level } für Zustände.
   */
  define('status', (c, el) => {
    el.classList.add('status');
    if (c.align === 'right') el.style.justifyContent = 'flex-end';
    const dot = h('span', { class: 'dot' }), t = h('span');
    el.append(dot, t);
    return {
      update() {
        let worst = 0, label = '', custom = null;
        for (const check of c.checks || []) {
          let zone = 0, text = null;
          if (check.when || check.is !== undefined) {
            const hit = check.when ? Sx.cond(check.when) : Sx.get(check.sensor) === check.is;
            if (hit) { zone = check.level === 'crit' ? 2 : 1; text = check.text || check.label || ''; }
          } else {
            const v = Sx.num(check.sensor);
            if (v == null) continue;
            zone = v >= check.crit ? 2 : v >= check.warn ? 1 : 0;
          }
          if (zone > worst) { worst = zone; label = check.label; custom = text; }
        }
        let col, text;
        if (worst === 2) { col = '@crit'; text = custom ?? (c.critText || '{label} kritisch').replace('{label}', label); }
        else if (worst === 1) { col = '@warn'; text = custom ?? (c.warnText || '{label} erhöht').replace('{label}', label); }
        else if (c.activeIf && Sx.cond(c.activeIf)) { col = '@ok'; text = c.activeText || 'Spielmodus'; }
        else { col = '@ok'; text = c.okText || 'Alles normal'; }
        dot.style.background = Sx.color(col);
        dot.style.boxShadow = `0 0 10px ${Sx.colorValue(col)}`;
        setText(t, text);
      },
    };
  });

  /** Fläche, z. B. als Trennlinie. */
  define('box', (c, el) => {
    el.style.background = Sx.color(c.fill || '@line');
    if (c.radius) el.style.borderRadius = c.radius + 'px';
  });

  /** Symbol aus der eingebauten Sammlung. */
  define('icon', (c, el) => {
    const px = c.size || 24;
    el.append(icon(c.name, px, `width:${px}px;height:${px}px;` + (c.color ? `color:${Sx.color(c.color)}` : '')));
  });

  // ---------- Bausteine für Home Assistant ----------
  // Sie lesen Werte wie „ha:weather.x“, „ha:weather.x@temperature“ oder „ha:climate.y#state“.

  /** Aktuelles Wetter: Symbol, Temperatur, Lage · Luftfeuchte · Wind. entity: weather.… */
  define('weather', (c, el) => {
    el.classList.add('wx');
    const ico = h('div', { class: 'wx-ico' });
    const t = h('span', { class: 'n', style: `font-size:${c.size || 58}px` });
    const u = h('span', { class: 'u', style: `font-size:${c.unitSize || 24}px;margin-left:4px`, text: '°C' });
    const sub = h('div', { class: 'wx-sub' });
    el.append(ico, h('div', { class: 'wx-temp' }, t, u), sub);
    let shown;
    return {
      update() {
        const id = 'ha:' + c.entity, condition = Sx.get(id);
        if (condition !== shown) {
          shown = condition;
          ico.textContent = '';
          const tint = condition === 'sunny' ? 'color-mix(in srgb, var(--warn) 80%, var(--text))' : condition === 'clear-night' ? 'color-mix(in srgb, var(--up) 45%, var(--text))' : 'color-mix(in srgb, var(--muted) 60%, var(--text))';
          const px = c.iconSize || 50;
          ico.append(icon(WX[condition] || 'cloud', px, `color:${tint};stroke-width:1.5;width:${px}px;height:${px}px`));
        }
        const temp = Sx.num(id + '@temperature');
        setText(t, Sx.fmt(temp, 1));
        u.style.visibility = temp == null ? 'hidden' : '';
        const parts = [];
        if (condition != null) parts.push(Sx.de(condition));
        const humidity = Sx.num(id + '@humidity'), wind = Sx.num(id + '@wind_speed');
        if (humidity != null) parts.push(Sx.fmt(humidity, 0) + ' %');
        if (wind != null) parts.push(Sx.fmt(wind, 0) + ' ' + (Sx.get(id + '@wind_speed_unit') || 'km/h'));
        setText(sub, parts.length ? parts.join(' · ') : 'keine Daten');
      },
    };
  });

  /** Vorhersage der nächsten Tage (ohne heute). entity: weather.…, days: Anzahl. */
  define('forecast', (c, el) => {
    el.classList.add('fc');
    const dayKey = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    let sig = null;
    return {
      update() {
        const list = Sx.get(`ha:${c.entity}#forecast`);
        const today = dayKey(new Date()), seen = new Set(), days = [];
        for (const f of Array.isArray(list) ? list : []) {
          const d = Sx.toDate(f && f.datetime);
          if (!d) continue;
          const k = dayKey(d);
          if (k <= today || seen.has(k)) continue;
          seen.add(k);
          days.push({ d, f });
          if (days.length >= (c.days || 3)) break;
        }
        const next = days.map(x => `${dayKey(x.d)}|${x.f.condition}|${x.f.temperature}|${x.f.templow}`).join(';');
        if (next === sig) return;
        sig = next;
        el.textContent = '';
        if (!days.length) { el.append(h('div', { class: 'fc-empty', text: 'Vorhersage folgt' })); return; }
        for (const { d, f } of days) {
          el.append(h('div', { class: 'fc-day' },
            h('div', { class: 'lbl', text: d.toLocaleDateString(Sx.st.locale, { weekday: 'short' }).replace('.', '') }),
            icon(WX[f.condition] || 'cloud', 24, 'color:color-mix(in srgb, var(--muted) 60%, var(--text));stroke-width:1.5;display:block;margin:9px auto 5px;width:24px;height:24px'),
            h('div', { class: 'fc-t' },
              h('span', { class: 'n', text: Sx.fmt(f.temperature, 0) + '°' }),
              h('span', { class: 'fc-lo', text: typeof f.templow === 'number' ? ' / ' + Sx.fmt(f.templow, 0) + '°' : '' }))));
        }
      },
    };
  });

  /** Wer ist zuhause. items: [{ name, sensor: "ha:person.x", initial? }] */
  define('people', (c, el) => {
    el.classList.add('people');
    const rows = (c.items || []).map(p => {
      const av = h('div', { class: 'av', text: p.initial || (p.name || '?').slice(0, 1).toUpperCase() });
      const text = h('span'), state = h('div', { class: 'st' }, h('i'), text);
      el.append(h('div', { class: 'person' }, av, h('div', null, h('div', { class: 'p-name', text: p.name || '' }), state)));
      return { p, av, state, text };
    });
    return {
      update() {
        for (const r of rows) {
          const v = Sx.get(r.p.sensor), home = v === 'home';
          r.av.classList.toggle('home', home);
          r.state.dataset.c = home ? 'ok' : '';
          setText(r.text, v == null ? 'unbekannt' : home ? 'Zuhause' : v === 'not_home' ? 'Unterwegs' : Sx.de(v));
        }
      },
    };
  });

  /**
   * Zustandszeilen „Symbol · Name · ● Zustand“.
   * Zeile mit sensor + map: { "locked": ["Abgeschlossen", "@ok"] }, optional icons je Zustand.
   * Zeile mit group: mehrere Sensoren, z. B. Fenster → „Alle zu“ oder „WC offen“.
   */
  define('states', (c, el) => {
    el.classList.add('states');
    if (c.gap != null) el.style.gap = c.gap + 'px';
    const rows = (c.rows || []).map(r => {
      const ico = h('span', { class: 's-ico' }), text = h('span'), st = h('span', { class: 'st' }, h('i'), text);
      el.append(h('div', { class: 'srow', style: `height:${c.rowHeight || 30}px` }, ico, h('span', { class: 's-lbl', text: r.label || '' }), st));
      return { r, ico, st, text, icon: null };
    });
    return {
      update() {
        for (const x of rows) {
          const r = x.r;
          let text, col = null, name = r.icon;
          if (r.group) {
            const active = r.group.filter(g => Sx.get(g.sensor) === (r.active ?? 'on'));
            if (!r.group.some(g => Sx.get(g.sensor) != null)) text = 'unbekannt';
            else if (active.length) { text = (r.activeText || '{names} offen').replace('{names}', active.map(g => g.name).join(', ')); col = r.activeColor || '@warn'; }
            else { text = r.idleText || 'Alle zu'; col = r.idleColor || '@ok'; }
          } else {
            const v = Sx.get(r.sensor), m = r.map && v != null ? r.map[v] : null;
            text = m ? m[0] : Sx.de(v);
            col = m ? m[1] : null;
            if (r.icons && v != null && r.icons[v]) name = r.icons[v];
          }
          if (name !== x.icon) { x.icon = name; x.ico.textContent = ''; if (name) x.ico.append(icon(name, 20)); }
          setText(x.text, text);
          x.st.dataset.c = col ? col.replace('@', '') : '';
        }
      },
    };
  });

  /** Ein Zustand als Text, optional mit Übersetzung und Farbe: map: { "idle": ["Bereit", "@ok"] }. */
  define('state', (c, el) => {
    el.classList.add('stt');
    font(el, c, { size: 16 });
    const t = h('span');
    el.append(t);
    return {
      update() {
        const v = Sx.get(c.sensor), m = c.map && v != null ? c.map[v] : null;
        setText(t, m ? m[0] : v == null ? (c.empty ?? '–') : Sx.de(v));
        el.dataset.c = m && m[1] ? m[1].replace('@', '') : '';
      },
    };
  });

  /**
   * Verbraucher nach Leistung sortiert, mit Balken im Verhältnis zum größten.
   * items: [{ label, sensor, tag? }], columns, rows. Die Reihenfolge wechselt höchstens alle 10 s.
   */
  define('consumers', (c, el) => {
    el.classList.add('consumers');
    const cols = c.columns || 2, rows = c.rows || 3, gap = c.gap ?? 50, rowH = c.rowHeight || 46;
    const colW = (c.w - (cols - 1) * gap) / cols;
    const cells = [];
    for (let i = 0; i < cols * rows; i++) {
      const nm = h('div', { class: 'c-nm' }), n = h('span', { class: 'n' }), u = h('span', { class: 'u', text: 'W' }), fill = h('i');
      const cell = h('div', { class: 'cons', style: `left:${Math.floor(i / rows) * (colW + gap)}px;top:${(i % rows) * rowH}px;width:${colW}px` },
        nm, h('div', { class: 'c-vl' }, n, u), h('div', { class: 'bar c-bar' }, fill));
      el.append(cell);
      cells.push({ cell, nm, n, u, fill });
    }
    let order = [], sorted = 0;
    return {
      update() {
        const items = (c.items || []).map((it, i) => ({ it, i, v: Sx.num(it.sensor) })).filter(x => x.v != null);
        const present = items.map(x => x.i).sort().join(',');
        if (Date.now() - sorted > 10000 || present !== [...order].sort().join(',')) {
          order = [...items].sort((a, b) => b.v - a.v).map(x => x.i);
          sorted = Date.now();
        }
        const byIndex = new Map(items.map(x => [x.i, x]));
        const list = order.map(i => byIndex.get(i)).filter(Boolean);
        const max = Math.max(1, ...list.map(x => x.v));
        cells.forEach((cl, k) => {
          const x = list[k];
          cl.cell.style.visibility = x ? '' : 'hidden';
          if (!x) return;
          setHTML(cl.nm, Sx.esc(x.it.label || '') + (x.it.tag ? `<b>${Sx.esc(x.it.tag)}</b>` : ''));
          const off = x.v < 0.5;
          cl.cell.classList.toggle('idle', x.v < (c.idleBelow ?? 5));
          cl.cell.classList.toggle('off', off);
          setText(cl.n, off ? 'aus' : Sx.fmt(x.v, 0));
          cl.u.style.display = off ? 'none' : '';
          cl.fill.style.width = (clamp01(x.v / max) * 100).toFixed(1) + '%';
        });
      },
    };
  });

  /**
   * Heizungen: Raum, Ist-Temperatur, Soll, Zustand (heizt / ruht / aus / Fenster offen / nicht erreichbar).
   * rows: [{ label, entity: "climate.x", window?: "ha:binary_sensor.y", sensor?: Ersatz für die Ist-Temperatur }]
   */
  define('climate', (c, el) => {
    el.classList.add('climate');
    const rowH = c.rowHeight || 58;
    const rows = (c.rows || []).map((r, i) => {
      const cur = h('span', { class: 'n' }), unit = h('span', { class: 'u', text: '°C' });
      const target = h('div', { class: 'cl-tgt' }), chip = h('span', { class: 'chip cl-chip' });
      const row = h('div', { class: 'cl-row', style: `top:${i * rowH}px;height:${rowH - 6}px` },
        h('div', { class: 'cl-room', text: r.label || '' }), h('div', { class: 'cl-cur' }, cur, unit), target, chip);
      el.append(row);
      return { r, row, cur, unit, target, chip, sig: null };
    });
    return {
      update() {
        for (const x of rows) {
          const id = 'ha:' + x.r.entity, state = Sx.get(id + '#state');
          const offline = state == null || state === 'unavailable' || state === 'unknown';
          const cur = Sx.num(id + '@current_temperature') ?? (x.r.sensor ? Sx.num(x.r.sensor) : null);
          const target = Sx.num(id + '@temperature');
          const windowOpen = !!x.r.window && Sx.get(x.r.window) === 'on';
          x.row.classList.toggle('dim', offline);
          setText(x.cur, Sx.fmt(cur, 1));
          x.unit.style.visibility = cur == null ? 'hidden' : '';
          setText(x.target, offline ? 'Thermostat' : target == null ? '' : `Soll ${Sx.fmt(target, 1)} °C`);
          let kind, text;
          if (offline) { kind = 'off'; text = 'nicht erreichbar'; }
          else if (windowOpen) { kind = 'warn'; text = state === 'off' ? 'aus · Fenster offen' : 'Fenster offen'; }
          else if (Sx.get(id + '@hvac_action') === 'heating') { kind = 'heat'; text = 'heizt'; }
          else if (state === 'off') { kind = ''; text = 'aus'; }
          else { kind = ''; text = 'ruht'; }
          if (x.sig !== kind + '|' + text) {
            x.sig = kind + '|' + text;
            x.chip.dataset.k = kind;
            x.chip.textContent = '';
            if (kind === 'heat') x.chip.append(icon('flame', 16));
            x.chip.append(text);
          }
        }
      },
    };
  });

  /** Balken mit Wohlfühlbereich und Markierung, z. B. Luftfeuchte: min, max, from, to, text. */
  define('range', (c, el) => {
    el.classList.add('range');
    const min = c.min ?? 0, max = c.max ?? 100, span = (max - min) || 1;
    const zone = h('div', { class: 'rg-zone', style: `left:${((c.from - min) / span * 100).toFixed(1)}%;width:${((c.to - c.from) / span * 100).toFixed(1)}%` });
    const mark = h('div', { class: 'rg-mark' });
    el.append(h('div', { class: 'rg-track' }, zone, mark), h('div', { class: 'rg-lbl', text: c.text || '' }));
    return {
      update() {
        const v = Sx.num(c.sensor);
        mark.style.display = v == null ? 'none' : '';
        if (v == null) return;
        mark.style.left = (clamp01((v - min) / span) * 100).toFixed(1) + '%';
        mark.dataset.c = v >= c.from && v <= c.to ? 'ok' : 'warn';
      },
    };
  });

  /**
   * Gerätekachel. entity: Zustand (on/off); toggle: true = Klick schaltet um (nur light, switch, fan, input_boolean).
   * Ohne entity entscheidet onIf (z. B. Leistung > 5 W). onText/offText, subOn/subOff (Vorlagen).
   */
  define('tile', (c, el) => {
    el.classList.add('tile2');
    el.dataset.kind = c.kind || (c.toggle ? 'light' : 'device');
    const val = h('span', { class: 'n t-val' }), sub = h('span', { class: 't-sub' });
    el.append(h('div', { class: 'ic' }, icon(c.icon || 'bulb', 26)), h('div', { class: 'tn', text: c.label || '' }), h('div', { class: 'tv' }, val, sub));
    let busyUntil = 0, before;
    if (c.toggle && c.entity) {
      const hint = icon('click', 18);
      hint.classList.add('clickhint');
      el.append(hint);
      el.classList.add('clickable');
      el.addEventListener('click', () => {
        if (Date.now() < busyUntil) return;
        busyUntil = Date.now() + 4000;
        before = Sx.get(`ha:${c.entity}#state`);
        el.classList.add('busy');
        Sx.post({ type: 'haToggle', entity: c.entity });
      });
    }
    return {
      update() {
        const state = c.entity ? Sx.get(`ha:${c.entity}#state`) : undefined;
        const offline = c.entity ? (state == null || state === 'unavailable') : (c.sensor != null && Sx.get(c.sensor) == null);
        const on = !offline && (c.onIf ? Sx.cond(c.onIf) : state === 'on');
        if (el.classList.contains('busy') && (Date.now() > busyUntil || state !== before)) el.classList.remove('busy');
        el.classList.toggle('on', on);
        el.classList.toggle('offline', !!offline);
        setText(val, offline ? 'nicht erreichbar' : on ? (c.onText || 'An') : (c.offText || 'Aus'));
        const s = offline ? null : on ? c.subOn : c.subOff;
        setText(sub, s ? ' · ' + Sx.tpl(s) : '');
      },
    };
  });

  return { define, mount, reset, update, icon, h, types: () => Object.keys(factories), iconNames: () => Object.keys(ICONS) };
})();
