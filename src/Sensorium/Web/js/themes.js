'use strict';
/* Sensorium – fertige Looks (Theme-Vorlagen) für Editor und Einrichtungsassistent.
   Ein Theme ändert nur Farben, Hintergrund, Kartenstil und Schriften, nie die Anordnung. */
const Themes = (() => {
  const FONTS = { num: "Bahnschrift, 'Segoe UI', sans-serif", ui: "'Segoe UI Variable Text', 'Segoe UI', sans-serif" };
  const STATUS = {
    warn: '#ffb446', crit: '#ff5876', ok: '#4fe0a0', 'warn-text': '#ffd08a', 'crit-text': '#ff9aac', 'ok-text': '#8ff0c4',
  };
  const STATUS_GRADIENTS = { warn: ['#ffd060', '#ff8a3d'], crit: ['#ff8a96', '#ff3d6e'], ok: ['#5ff0b0', '#2bbf8a'] };

  const list = [
    {
      id: 'aurora', name: 'Aurora', text: 'Der Standard: tiefes Blau mit Cyan und Violett.',
      theme: {
        background: 'aurora', cards: 'glass', fonts: FONTS,
        colors: Object.assign({
          bg: '#05090f', text: '#e9f1f8', muted: '#8596ab', dim: '#4f5d70', line: 'rgba(140,190,255,.085)', track: 'rgba(255,255,255,.065)',
          accent: '#38d2ef', accent2: '#6d8cff', up: '#a08cff', 'card-top': 'rgba(25,35,55,.72)', 'card-bottom': 'rgba(10,15,26,.80)',
        }, STATUS),
        gradients: Object.assign({ accent: ['#22c3ec', '#6d8cff'], up: ['#b9a6ff', '#8a6cff'] }, STATUS_GRADIENTS),
      },
    },
    {
      id: 'mitternacht', name: 'Mitternacht', text: 'Reines Schwarz, ruhige Grautöne – ideal für OLED.',
      theme: {
        background: 'plain', cards: 'flat', fonts: FONTS,
        colors: {
          bg: '#000000', text: '#f2f4f7', muted: '#8b93a1', dim: '#474e59', line: 'rgba(255,255,255,.075)', track: 'rgba(255,255,255,.07)',
          accent: '#dfe6ee', accent2: '#8c9bb0', up: '#b9acd9', 'card-top': '#0b0d10', 'card-bottom': '#08090b',
          warn: '#ffb84d', crit: '#ff5c7a', ok: '#5ce0a8', 'warn-text': '#ffd394', 'crit-text': '#ff9fb0', 'ok-text': '#94f0c8',
        },
        gradients: { accent: ['#ffffff', '#8c9bb0'], up: ['#cfc4ee', '#8f7fd0'], warn: ['#ffd060', '#ff8a3d'], crit: ['#ff8a96', '#ff3d6e'], ok: ['#6ff0b8', '#2bbf8a'] },
      },
    },
    {
      id: 'neon', name: 'Neon', text: 'Pink und Türkis über einem leuchtenden Horizont.',
      theme: {
        background: 'horizon', cards: 'glass', fonts: FONTS,
        colors: {
          bg: '#08040f', text: '#fbefff', muted: '#a593bd', dim: '#5a4a70', line: 'rgba(255,79,216,.14)', track: 'rgba(255,255,255,.07)',
          accent: '#ff4fd8', accent2: '#4fe6ff', up: '#9d7bff', 'card-top': 'rgba(34,14,52,.72)', 'card-bottom': 'rgba(14,6,26,.86)',
          warn: '#ffd24f', crit: '#ff4f6e', ok: '#4fffb0', 'warn-text': '#ffe592', 'crit-text': '#ff9db0', 'ok-text': '#9cffd4',
        },
        gradients: { accent: ['#ff4fd8', '#7a5cff'], up: ['#4fe6ff', '#9d7bff'], warn: ['#ffe24f', '#ff8a3d'], crit: ['#ff8fb0', '#ff3d6e'], ok: ['#7affc8', '#2bdf9a'] },
      },
    },
    {
      id: 'terminal', name: 'Terminal', text: 'Grün auf Schwarz, Raster und Rahmen wie ein Monitor von früher.',
      theme: {
        background: 'grid', cards: 'outline', fonts: { num: "Consolas, 'Cascadia Mono', monospace", ui: FONTS.ui },
        colors: {
          bg: '#020805', text: '#d6ffe2', muted: '#6fb488', dim: '#36634a', line: 'rgba(57,255,136,.14)', track: 'rgba(57,255,136,.08)',
          accent: '#39ff88', accent2: '#00c46a', up: '#7fd8ff', 'card-top': 'rgba(4,20,11,.86)', 'card-bottom': 'rgba(2,12,6,.92)',
          warn: '#e8ff4f', crit: '#ff5f56', ok: '#39ff88', 'warn-text': '#f0ff9a', 'crit-text': '#ff9e98', 'ok-text': '#9effc2',
        },
        gradients: { accent: ['#7dffb0', '#00c46a'], up: ['#a8ecff', '#3fb6e6'], warn: ['#f4ff7a', '#c8d63a'], crit: ['#ff8f87', '#ff3d3d'], ok: ['#7dffb0', '#00c46a'] },
      },
    },
    {
      id: 'glut', name: 'Glut', text: 'Warmes Orange und Rot, passend zu roter Beleuchtung.',
      theme: {
        background: 'glow', cards: 'glass', fonts: FONTS,
        colors: {
          bg: '#0b0605', text: '#fff0e6', muted: '#b3958a', dim: '#6a5048', line: 'rgba(255,140,90,.11)', track: 'rgba(255,255,255,.065)',
          accent: '#ff9a3d', accent2: '#ff4d5e', up: '#ffcf5c', 'card-top': 'rgba(44,22,14,.72)', 'card-bottom': 'rgba(20,10,7,.86)',
          warn: '#ffd24f', crit: '#ff4d5e', ok: '#9be37a', 'warn-text': '#ffe08f', 'crit-text': '#ff9da6', 'ok-text': '#c6f5ae',
        },
        gradients: { accent: ['#ffc04d', '#ff5a3d'], up: ['#ffe08a', '#ff9a3d'], warn: ['#ffe24f', '#ff9a3d'], crit: ['#ff8f87', '#ff2d55'], ok: ['#c6f59a', '#5fcf5a'] },
      },
    },
    {
      id: 'gold', name: 'Gold', text: 'Schwarz und Gold, edel und zurückhaltend.',
      theme: {
        background: 'aurora', cards: 'glass', fonts: FONTS,
        colors: {
          bg: '#090806', text: '#f6f0e4', muted: '#a89c88', dim: '#5e5546', line: 'rgba(242,196,109,.12)', track: 'rgba(255,255,255,.06)',
          accent: '#f2c46d', accent2: '#c8892f', up: '#e6cf9c', 'card-top': 'rgba(30,26,18,.74)', 'card-bottom': 'rgba(13,11,8,.86)',
          warn: '#ffb446', crit: '#ff5c6c', ok: '#7fdcae', 'warn-text': '#ffd496', 'crit-text': '#ffa2ad', 'ok-text': '#b4f0d2',
        },
        gradients: { accent: ['#ffe1a1', '#c8892f'], up: ['#f4e3bd', '#c9a76a'], warn: ['#ffd060', '#ff8a3d'], crit: ['#ff8a96', '#ff3d6e'], ok: ['#a8f0c8', '#4fbf8a'] },
      },
    },
    {
      id: 'polar', name: 'Polar', text: 'Hell und klar – für helle Räume und tagsüber.',
      theme: {
        background: 'glow', cards: 'glass', tone: 'light', fonts: FONTS,
        colors: {
          bg: '#e8edf3', text: '#0f1a28', muted: '#5a6878', dim: '#9aa5b3', line: 'rgba(20,50,90,.11)', track: 'rgba(20,50,90,.08)',
          accent: '#0a86d0', accent2: '#5560f0', up: '#7a54e8', 'card-top': '#ffffff', 'card-bottom': '#f6f8fb',
          warn: '#d98200', crit: '#d8304c', ok: '#0f9e66', 'warn-text': '#a85f00', 'crit-text': '#b81f3a', 'ok-text': '#0b7f52',
        },
        gradients: { accent: ['#13a4e8', '#5560f0'], up: ['#9b7cf2', '#6a46e0'], warn: ['#ffb02e', '#f07a12'], crit: ['#ff6b81', '#d8304c'], ok: ['#2fd08f', '#0f9e66'] },
      },
    },
  ];
  const byId = new Map(list.map(p => [p.id, p]));

  /** Wendet eine Vorlage auf ein Profil an (Sprache und Zahlenformat bleiben). */
  function apply(doc, id) {
    const p = byId.get(id);
    if (!p || !doc) return false;
    const old = doc.theme || {};
    doc.theme = Object.assign({ locale: old.locale || 'de-DE' }, JSON.parse(JSON.stringify(p.theme)));
    return true;
  }

  /** Welche Vorlage entspricht dem Theme? null bei eigenen Farben. */
  function match(theme) {
    const t = theme || {}, c = t.colors || {};
    const key = x => [String((x.colors || {}).bg || '#05090f').toLowerCase(), String((x.colors || {}).accent || '#38d2ef').toLowerCase(),
      String((x.colors || {}).accent2 || '#6d8cff').toLowerCase(), x.background || 'aurora', x.cards || 'glass', x.tone || 'dark'].join('|');
    const k = key({ colors: c, background: t.background, cards: t.cards, tone: t.tone });
    const hit = list.find(p => key(p.theme) === k);
    return hit ? hit.id : null;
  }

  /** Kleines Vorschaubild aus Farben (ohne CSS-Variablen, damit mehrere nebeneinander gehen). */
  function swatch(id) {
    const p = byId.get(id);
    const c = p.theme.colors, g = p.theme.gradients.accent;
    const el = (tag, css) => { const e = document.createElement(tag); e.style.cssText = css; return e; };
    const glow = {
      aurora: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${c.accent} 30%, transparent), transparent 60%), radial-gradient(120% 90% at 100% 100%, color-mix(in srgb, ${c.up} 30%, transparent), transparent 60%)`,
      glow: `radial-gradient(130% 80% at 50% -20%, color-mix(in srgb, ${c.accent} 32%, transparent), transparent 70%)`,
      horizon: `radial-gradient(140% 60% at 50% 120%, color-mix(in srgb, ${c.accent} 45%, transparent), transparent 70%)`,
      grid: `linear-gradient(color-mix(in srgb, ${c.accent} 12%, transparent) 1px, transparent 1px) 0 0 / 12px 12px, linear-gradient(90deg, color-mix(in srgb, ${c.accent} 12%, transparent) 1px, transparent 1px) 0 0 / 12px 12px`,
      plain: 'none',
    }[p.theme.background] || 'none';
    const box = el('div', `position:relative;height:100%;border-radius:10px;overflow:hidden;background:${glow === 'none' ? '' : glow + ','}${c.bg};`);
    const cardBg = p.theme.cards === 'outline' ? 'transparent' : p.theme.cards === 'flat' ? c['card-top'] : `linear-gradient(180deg, ${c['card-top']}, ${c['card-bottom']})`;
    const cardBorder = p.theme.cards === 'outline' ? `color-mix(in srgb, ${c.accent} 40%, transparent)` : c.line;
    const card = el('div', `position:absolute;left:10%;right:10%;top:16%;bottom:16%;border-radius:8px;background:${cardBg};border:1px solid ${cardBorder};` +
      (p.theme.tone === 'light' ? 'box-shadow:0 6px 14px -8px rgba(20,40,70,.45);' : ''));
    card.append(
      el('div', `position:absolute;left:12%;top:16%;width:3px;height:9px;border-radius:2px;background:${c.accent};box-shadow:0 0 6px ${c.accent}`),
      el('div', `position:absolute;left:18%;top:19%;width:34%;height:4px;border-radius:2px;background:color-mix(in srgb, ${c.accent} 70%, transparent)`),
      el('div', `position:absolute;left:12%;top:40%;width:30%;height:13px;border-radius:3px;background:${c.text};opacity:.85`),
      el('div', `position:absolute;left:12%;right:12%;bottom:22%;height:5px;border-radius:3px;background:${c.track}`),
      el('div', `position:absolute;left:12%;width:52%;bottom:22%;height:5px;border-radius:3px;background:linear-gradient(90deg, ${g[0]}, ${g[1]})`),
      el('div', `position:absolute;right:12%;top:42%;width:7px;height:7px;border-radius:50%;background:${c.ok}`),
      el('div', `position:absolute;right:calc(12% + 11px);top:42%;width:7px;height:7px;border-radius:50%;background:${c.warn}`),
      el('div', `position:absolute;right:calc(12% + 22px);top:42%;width:7px;height:7px;border-radius:50%;background:${c.crit}`));
    box.append(card);
    return box;
  }

  return { list, byId, apply, match, swatch };
})();
