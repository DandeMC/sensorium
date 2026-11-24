'use strict';
/* Sensorium – Fenster „Sensoren und Zuordnung“: alle Sensoren mit Live-Werten, Zuordnungen ändern. */
(() => {
  const $ = sel => document.querySelector(sel);
  const els = { status: $('#status'), banner: $('#banner'), aliases: $('#aliases'), rows: $('#rows'), q: $('#q'), chips: $('#chips'), pick: $('#pick'), toast: $('#toast') };
  const GROUPS = [
    ['all', 'Alle', null],
    ['cpu', 'Prozessor', ['Cpu']],
    ['gpu', 'Grafikkarte', ['GpuNvidia', 'GpuAmd', 'GpuIntel']],
    ['board', 'Mainboard', ['Motherboard', 'SuperIO', 'EmbeddedController', 'Cooler']],
    ['storage', 'Laufwerke', ['Storage', 'Drive']],
    ['memory', 'Speicher', ['Memory']],
    ['system', 'System', ['System', 'Network']],
    ['fps', 'FPS', ['Fps']],
    ['plug', 'Steckdosen', ['Plug']],
    ['ha', 'Home Assistant', ['HomeAssistant']],
  ];
  const TYPES = {
    Temperature: 'Temperatur', Load: 'Auslastung', Clock: 'Takt', Power: 'Leistung', Fan: 'Lüfter', Voltage: 'Spannung',
    Current: 'Strom', Data: 'Daten', SmallData: 'Daten', Throughput: 'Durchsatz', Control: 'Steuerung', Level: 'Füllstand',
    Factor: 'Faktor', Frequency: 'Frequenz', Text: 'Text', Count: 'Anzahl', TimeSpan: 'Zeit', Energy: 'Energie', Flow: 'Durchfluss', Fps: 'Framerate',
    Value: 'Wert', State: 'Zustand',
  };
  const state = { group: 'all', q: '', editing: null, rows: [], aliasRows: [] };

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) if (v != null && v !== false) { if (k === 'class') el.className = v; else el.setAttribute(k, v); }
    for (const kid of kids) if (kid != null) el.append(kid);
    return el;
  }

  function format(sensor, v) {
    if (v == null) return '–';
    if (Array.isArray(v)) return `${v.length} Werte`;
    if (typeof v === 'string') return v || '–';
    switch (sensor ? sensor.unit : '') {
      case 'B/s': return Sx.rate(v).join(' ');
      case 'B': return Sx.size(v).join(' ');
      case 's': return Sx.dur(v);
      case '°C': return Sx.fmt(v, 1) + ' °C';
      case '%': return Sx.fmt(v, 1) + ' %';
      case 'MHz': return Sx.fmt(v, 0) + ' MHz';
      case 'W': return Sx.fmt(v, 1) + ' W';
      case 'RPM': return Sx.fmt(v, 0) + ' RPM';
      case 'V': return Sx.fmt(v, 3) + ' V';
      case 'GB': return Sx.fmt(v, 2) + ' GB';
      case 'MB': return Sx.fmt(v, 0) + ' MB';
      case 'FPS': return Sx.fmt(v, 0) + ' FPS';
      case 'ms': return Sx.fmt(v, 1) + ' ms';
      default: return Sx.fmt(v, Number.isInteger(v) || Math.abs(v) >= 100 ? 0 : 2) + (sensor && sensor.unit ? ' ' + sensor.unit : '');
    }
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { els.toast.hidden = true; }, 3500);
  }

  function renderStatus() {
    const st = Sx.st.status || {};
    els.status.textContent = '';
    const pill = (ok, text) => h('span', { class: 'pill ' + (ok ? 'ok' : 'bad') }, text);
    els.status.append(
      pill(st.elevated, st.elevated ? 'Adminrechte' : 'Ohne Adminrechte'),
      pill(st.pawnio, st.pawnio ? 'PawnIO installiert' : 'PawnIO fehlt'),
      pill(st.rtss, st.rtss ? 'RTSS verbunden' : 'RTSS nicht gefunden'),
      pill(st.haConnected, st.haConnected ? 'Home Assistant verbunden' : 'Home Assistant: ' + (st.ha || 'nicht eingerichtet')),
      h('span', { class: 'pill' }, `${Sx.st.catalog.length} Sensoren`));

    const messages = [];
    if (st.elevated === false) messages.push('Sensorium läuft ohne Adminrechte. Deshalb fehlen zum Beispiel Laufwerkstemperaturen.');
    if (st.pawnio === false) messages.push('Der PawnIO-Treiber fehlt. Ohne ihn gibt es keine CPU-Temperatur, keinen CPU-Takt, keine CPU-Leistung und keine Lüfter- und Pumpenwerte. <a href="https://pawnio.eu/">PawnIO herunterladen</a>');
    if (st.hardwareError) messages.push('Fehler beim Lesen der Hardware: ' + Sx.esc(st.hardwareError));
    els.banner.hidden = messages.length === 0;
    els.banner.innerHTML = messages.map(m => `<p>${m}</p>`).join('');
  }

  function describeTarget(alias) {
    if (!alias.expr) return 'nicht gefunden';
    const id = Sx.aliasTarget(alias.name);
    if (id) {
      const sensor = Sx.st.byId.get(id);
      return sensor ? `${sensor.name} · ${sensor.hw}` : id;
    }
    return 'Formel: ' + alias.expr;
  }

  function renderAliases() {
    els.aliases.textContent = '';
    state.aliasRows = [];
    const groups = new Map();
    for (const a of Sx.st.aliases) {
      if (!groups.has(a.group)) groups.set(a.group, []);
      groups.get(a.group).push(a);
    }
    if (!groups.size) els.aliases.append(h('p', { class: 'empty' }, 'Zuordnungen werden ermittelt …'));
    for (const [group, list] of groups) {
      els.aliases.append(h('h3', null, group));
      for (const a of list) {
        const value = h('span', { class: 'a-val' }, '–');
        const change = h('button', null, 'Ändern');
        change.onclick = () => startPick(a);
        const auto = h('button', { class: 'ghost', title: 'Wieder automatisch erkennen' }, 'Auto');
        auto.onclick = () => { Sx.post({ type: 'resetAlias', alias: a.name }); toast(`„${a.label}“ wird wieder automatisch erkannt.`); };
        auto.hidden = a.auto;
        const row = h('div', { class: 'alias' + (a.expr ? '' : ' missing') + (state.editing === a.name ? ' editing' : '') },
          h('div', { class: 'a-main' },
            h('div', { class: 'a-label' }, a.label, a.auto ? null : h('span', { class: 'tag' }, 'manuell')),
            h('div', { class: 'a-name' }, a.name),
            h('div', { class: 'a-target' + (a.error ? ' err' : '') }, a.error ? 'Fehler: ' + a.error : describeTarget(a))),
          value,
          h('div', { class: 'a-btns' }, change, auto));
        els.aliases.append(row);
        state.aliasRows.push({ name: a.name, value });
      }
    }
    updateValues();
  }

  function renderChips() {
    els.chips.textContent = '';
    for (const [id, label, types] of GROUPS) {
      const count = types ? Sx.st.catalog.filter(s => types.includes(s.hwType)).length : Sx.st.catalog.length;
      if (types && !count) continue;
      const button = h('button', { class: 'chipbtn' + (state.group === id ? ' on' : '') }, label + ' ', h('span', null, String(count)));
      button.onclick = () => { state.group = id; renderChips(); renderRows(); };
      els.chips.append(button);
    }
  }

  function renderRows() {
    const group = GROUPS.find(g => g[0] === state.group);
    const q = state.q.toLowerCase();
    const list = Sx.st.catalog
      .filter(s => !group[2] || group[2].includes(s.hwType))
      .filter(s => !q || `${s.name} ${s.hw} ${s.id} ${TYPES[s.type] || s.type}`.toLowerCase().includes(q));
    els.rows.textContent = '';
    state.rows = [];
    const fragment = document.createDocumentFragment();
    let lastHardware = null;
    for (const sensor of list) {
      if (sensor.hw !== lastHardware) {
        fragment.append(h('tr', { class: 'grp' }, h('td', { colspan: 4 }, sensor.hw)));
        lastHardware = sensor.hw;
      }
      const value = h('td', { class: 'r num' }, format(sensor, Sx.get(sensor.id)));
      const row = h('tr', null, h('td', null, sensor.name), h('td', { class: 'mut' }, TYPES[sensor.type] || sensor.type), value, h('td', { class: 'mono' }, sensor.id));
      row.onclick = () => pickSensor(sensor);
      fragment.append(row);
      state.rows.push({ sensor, value });
    }
    if (!list.length) fragment.append(h('tr', null, h('td', { colspan: 4, class: 'empty' }, Sx.st.catalog.length ? 'Keine Treffer.' : 'Sensoren werden geladen …')));
    els.rows.append(fragment);
  }

  function updateValues() {
    for (const { sensor, value } of state.rows) {
      const text = format(sensor, Sx.get(sensor.id));
      if (value.textContent !== text) value.textContent = text;
    }
    for (const { name, value } of state.aliasRows) {
      const id = Sx.aliasTarget(name);
      const text = format(id ? Sx.st.byId.get(id) : null, Sx.get(name));
      if (value.textContent !== text) value.textContent = text;
    }
  }

  function startPick(alias) {
    state.editing = alias.name;
    document.body.classList.add('picking');
    els.pick.hidden = false;
    els.pick.textContent = '';
    const cancel = h('button', { class: 'ghost' }, 'Abbrechen');
    cancel.onclick = cancelPick;
    els.pick.append(h('span', null, 'Wähle in der Liste den Sensor für ', h('b', null, alias.label), '.'), cancel);
    renderAliases();
  }

  function cancelPick() {
    state.editing = null;
    document.body.classList.remove('picking');
    els.pick.hidden = true;
    renderAliases();
  }

  function pickSensor(sensor) {
    if (!state.editing) return;
    const alias = Sx.st.aliasByName.get(state.editing);
    Sx.post({ type: 'setAlias', alias: state.editing, expr: '{' + sensor.id + '}' });
    toast(`„${alias ? alias.label : state.editing}“ nutzt jetzt „${sensor.name}“.`);
    cancelPick();
  }

  els.q.addEventListener('input', () => { state.q = els.q.value.trim(); renderRows(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.editing) cancelPick(); });
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();
    Sx.post({ type: 'open', url: link.href });
  });

  Sx.on('catalog', () => { renderStatus(); renderChips(); renderAliases(); renderRows(); });
  Sx.on('values', updateValues);
  Sx.on('toast', m => toast(m.message));

  renderRows();
  if (Demo.active) Demo.start();
  Sx.post({ type: 'ready', page: 'sensors' });
  setInterval(() => Sx.post({ type: 'heartbeat' }), 5000);
})();
