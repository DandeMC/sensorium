'use strict';
/* Demo-Daten: simuliert Sensorwerte, wenn die Seite ohne Sensorium läuft (Browser) oder mit ?demo=normal|gaming. */
const Demo = (() => {
  const params = new URLSearchParams(location.search);
  const requested = params.get('demo');
  const active = requested !== null || !Sx.isHost;
  let mode = requested === 'gaming' ? 'gaming' : 'normal';

  const TARGET = {
    normal: { cpuTemp: 37, cpuLoad: 15, cpuClock: 4600, cpuPower: 53, pump: 2367, gpuTemp: 30, gpuLoad: 28, gpuClock: 210, gpuMem: 405, gpuPower: 11.4, gpuFan: 0, vram: 1.3, ram: 10.4, down: 3.9e6, up: 4.3e5, fps: 0, cRead: 2.3e6, cWrite: 3.0e6, eRead: 0, eWrite: 0, cTemp: 42, eTemp: 27, fan0: 664, fan2: 658, pumpTach: 4450, liquid: 25.2 },
    gaming: { cpuTemp: 74, cpuLoad: 58, cpuClock: 4900, cpuPower: 131, pump: 2420, gpuTemp: 63, gpuLoad: 97, gpuClock: 2655, gpuMem: 10501, gpuPower: 268, gpuFan: 1480, vram: 9.8, ram: 17.6, down: 9e5, up: 2.5e5, fps: 144, cRead: 6e5, cWrite: 1.4e6, eRead: 3.8e7, eWrite: 3e5, cTemp: 45, eTemp: 29, fan0: 1100, fan2: 1085, pumpTach: 4520, liquid: 31.5 },
  };
  const NOISE = { cpuTemp: 1.1, cpuLoad: 6, cpuClock: 120, cpuPower: 6, pump: 14, gpuTemp: .6, gpuLoad: 5, gpuClock: 45, gpuMem: 0, gpuPower: 2.5, gpuFan: 12, vram: .04, ram: .08, down: 1.6e6, up: 1.9e5, fps: 7, cRead: 1.5e6, cWrite: 1.9e6, eRead: 9e6, eWrite: 3e5, cTemp: .3, eTemp: .3, fan0: 8, fan2: 8, pumpTach: 500, liquid: .05 };
  const LIMIT = { cpuLoad: 100, gpuLoad: 100, cpuClock: 5000 };
  const WAVE = new Set(['cpuLoad', 'gpuLoad', 'cpuPower', 'gpuPower', 'down', 'up', 'cRead', 'cWrite', 'gpuClock']);
  const WEIGHTS = [1.5, 1.1, .7, 1.3, .5, .9, 1.25, .6, 1.4, .8, .45, 1.05, .7, 1.15, .6, .95];
  // Wie beim echten PC: Corsair-AIO per USB plus ein Mainboard-Anschluss mit Ersatzsignal der Pumpe.
  const FANS = [
    ['corsair:0c17/pump', 'Pumpe', 'pump', 'Cooler'],
    ['corsair:0c17/fan1', 'Lüfter 1', 'fan0', 'Cooler'],
    ['corsair:0c17/fan2', 'Lüfter 2', 'fan2', 'Cooler'],
    ['lhm:/lpc/nct6798d/0/fan/1', 'Fan #2', 'pumpTach', 'SuperIO'],
  ];
  const S = Object.assign({}, TARGET.normal);
  let threads = WEIGHTS.map(w => S.cpuLoad * w);
  const bootTime = Date.now() - 8040000;

  function step(m, factor = 1) {
    for (const k in S) {
      const t = TARGET[m][k] * (WAVE.has(k) ? factor : 1);
      S[k] += (t - S[k]) * 0.3 + (t ? (Math.random() - .5) * 2 * NOISE[k] : 0);
      if (S[k] < 0) S[k] = 0;
      if (LIMIT[k] && S[k] > LIMIT[k]) S[k] = LIMIT[k];
    }
    threads = threads.map((v, i) => v + (Math.min(100, S.cpuLoad * WEIGHTS[i] + Math.random() * 9) - v) * .5);
  }

  function values() {
    const ramTotal = 31.8, gaming = mode === 'gaming';
    const v = {
      'cpu.name': 'Intel Core i7-11700K', 'cpu.temp': S.cpuTemp, 'cpu.temp.max': S.cpuTemp + 4.3, 'cpu.load': S.cpuLoad,
      'cpu.clock': S.cpuClock, 'cpu.power': S.cpuPower, 'cpu.pump': S.pump, 'cpu.threads': threads.slice(),
      'gpu.name': 'NVIDIA GeForce RTX 4070 Ti SUPER', 'gpu.temp': S.gpuTemp, 'gpu.hotspot': S.gpuTemp + 8, 'gpu.load': S.gpuLoad,
      'gpu.clock': S.gpuClock, 'gpu.memclock': S.gpuMem, 'gpu.power': S.gpuPower, 'gpu.fan': S.gpuFan,
      'gpu.vram.used': S.vram, 'gpu.vram.total': 16, 'gpu.voltage': gaming ? 1.045 : 0.88,
      'power.total': S.cpuPower + S.gpuPower,
      'sys.cpu.name': 'Intel Core i7-11700K', 'sys.cpu.cores': 8, 'sys.cpu.threads': 16,
      'sys.board': 'ASUS TUF GAMING Z590-PLUS WIFI', 'sys.uptime': (Date.now() - bootTime) / 1000,
      'sys.ram.used': S.ram, 'sys.ram.total': ramTotal, 'sys.ram.free': ramTotal - S.ram, 'sys.ram.pct': S.ram / ramTotal * 100, 'sys.ram.info': '32 GB · DDR4-3200',
      'sys.net.down': S.down, 'sys.net.up': S.up, 'sys.net.name': 'Ethernet', 'sys.net.speed': '1 Gbit/s', 'sys.net.ip': '192.168.1.20',
      'fps.current': gaming ? S.fps : 0, 'fps.frametime': gaming && S.fps ? 1000 / S.fps : null, 'fps.app': gaming ? 'Spiel' : '',
    };
    const drives = [
      ['C', 2000398934016, 0.72, 'Samsung SSD 990 PRO 2TB', '', 'cRead', 'cWrite', 'cTemp', 0],
      ['E', 1024209543168, 0.47, 'Sabrent', '1TB NVMe', 'eRead', 'eWrite', 'eTemp', 1],
    ];
    for (const [L, total, pct, model, label, r, w, t, disk] of drives) {
      const p = `sys.drive.${L}.`;
      Object.assign(v, {
        [p + 'total']: total, [p + 'used']: total * pct, [p + 'free']: total * (1 - pct), [p + 'pct']: pct * 100,
        [p + 'label']: label, [p + 'model']: model, [p + 'disk']: disk, [p + 'read']: S[r], [p + 'write']: S[w],
        [`drive.${L}.temp`]: S[t], [`drive.${L}.model`]: model,
      });
    }
    for (const [id, , key] of FANS) v[id] = key ? S[key] : 0;
    Object.assign(v, {
      'corsair:0c17#name': 'Corsair H115i Platinum', 'corsair:0c17/liquid': S.liquid,
      'cooler.name': 'Corsair H115i Platinum', 'cooler.liquid': S.liquid,
    });
    homeValues(v);
    return v;
  }

  // Steckdose und Home Assistant: erfundene Beispielwerte für die Beispielseite „Zuhause“ (docs/beispiel-profil.json).
  let grid = 260;
  function homeValues(v) {
    const now = Date.now(), min = 60000, at = (days, h, m) => { const d = new Date(now + days * 86400000); d.setHours(h, m, 0, 0); return d; };
    const wall = Math.round((v['cpu.power'] + v['gpu.power']) * 1.1 + 88 + (Math.random() - .5) * 6);
    grid += (240 - grid) * 0.15 + (Math.random() - .5) * 60;
    const iso = d => d.toISOString();
    const climate = (id, state, cur, target, action) => ({
      [`ha:climate.${id}`]: state, [`ha:climate.${id}#state`]: state, [`ha:climate.${id}@current_temperature`]: cur,
      [`ha:climate.${id}@temperature`]: target, [`ha:climate.${id}@hvac_action`]: action,
    });
    const both = (id, state) => ({ [`ha:${id}`]: state, [`ha:${id}#state`]: state });
    Object.assign(v, {
      'ha.connected': 1, 'ha.status': 'verbunden',
      'pc.wall': wall, 'pc.rest': Math.max(0, wall - Math.round(v['cpu.power']) - Math.round(v['gpu.power'])),
      'pc.wall.today': 0.27, 'pc.wall.cost': 8.4, 'strom.preis.ct': 31,
      'ha:sun.sun': 'above_horizon', 'ha:sun.sun@next_setting': iso(at(0, 16, 41)), 'ha:sun.sun@next_rising': iso(at(1, 7, 50)),
      'ha:weather.forecast_home': 'sunny', 'ha:weather.forecast_home@temperature': 2.5,
      'ha:weather.forecast_home@humidity': 74, 'ha:weather.forecast_home@wind_speed': 13.1, 'ha:weather.forecast_home@wind_speed_unit': 'km/h',
      'ha:weather.forecast_home#forecast': [
        { datetime: iso(at(0, 12, 0)), condition: 'sunny', temperature: 3, templow: -3 },
        { datetime: iso(at(1, 12, 0)), condition: 'sunny', temperature: 4, templow: -2 },
        { datetime: iso(at(2, 12, 0)), condition: 'cloudy', temperature: 6, templow: 1 },
        { datetime: iso(at(3, 12, 0)), condition: 'rainy', temperature: 7, templow: 3 },
      ],
      'ha:person.alex': 'home', 'ha:person.sam': 'not_home',
      ...both('lock.haustuer', 'locked'),
      'ha:binary_sensor.fenster_bad': 'off', 'ha:binary_sensor.fenster_kueche': 'on',
      'ha:binary_sensor.fenster_kueche#changed': (now - 25 * min) / 1000,
      'ha:sensor.netz_leistung': Math.round(Math.max(120, grid)),
      'ha:sensor.batterie_ladestand': 55, 'ha:sensor.batterie_ladeleistung': 984, 'ha:sensor.batterie_entladeleistung': 0,
      'ha:sensor.pv_leistung': 1143, 'ha:sensor.pv_ins_haus': 159, 'ha:sensor.pv_prognose_heute': 3.66,
      'ha:input_number.strompreis': 0.31,
      'ha:sensor.schreibtisch_leistung': 90, 'ha:sensor.fernseher_leistung': 0, 'ha:sensor.kuehlschrank_leistung': 1,
      'ha:sensor.netzwerk_leistung': 80, 'ha:sensor.spuelmaschine_leistung': 1, 'ha:sensor.waschmaschine_leistung': 0,
      'ha:sensor.drucker_leistung': 142,
      'ha:sensor.buero_temperatur': 19.7, 'ha:sensor.buero_luftfeuchte': 48.3,
      ...climate('wohnzimmer', 'heat', 21.2, 22, 'heating'),
      ...climate('bad', 'heat', 18.4, 18, 'idle'),
      ...climate('kueche', 'off', 19.0, 18, 'idle'),
      'ha:climate.buero#state': 'unavailable',
      'ha:sensor.auto_akku': 60, 'ha:sensor.auto_reichweite': 278.4, 'ha:number.auto_ladelimit': 90,
      'ha:binary_sensor.auto_laedt': 'off', 'ha:device_tracker.auto': 'home',
      'ha:lock.auto_tueren': 'locked', 'ha:sensor.auto_innen': 21.0,
      'ha:sensor.auto_aussen': 4.5, 'ha:sensor.auto_kilometerstand': 50521.2,
      'ha:sensor.auto_stand': iso(new Date(now - 54 * min)),
      ...both('sensor.drucker_status', 'running'), 'ha:sensor.drucker_fortschritt': 64, 'ha:sensor.drucker_auftrag': 'Gehäusedeckel',
      'ha:sensor.drucker_restzeit': 72, 'ha:sensor.drucker_ende': iso(new Date(now + 72 * min)),
      'ha:sensor.drucker_schicht': 210, 'ha:sensor.drucker_schichten': 330,
      'ha:sensor.drucker_duese': 220, 'ha:sensor.drucker_bett': 65,
      ...both('light.schreibtisch', 'on'), ...both('light.regal', 'off'), ...both('input_boolean.waschmaschine_laeuft', 'off'),
      'ha:input_datetime.waschmaschine_start': iso(at(-2, 12, 34)),
    });
  }

  function catalog() {
    const sensors = FANS.map(([id, name, , hwType]) => ({
      id, name, hw: hwType === 'Cooler' ? 'Corsair H115i Platinum' : 'Nuvoton NCT6798D',
      hwId: hwType === 'Cooler' ? 'corsair/0c17' : '/lpc/nct6798d/0', hwType, type: 'Fan', unit: 'RPM', src: 'demo',
    }));
    const add = (id, name, hw, hwType, type, unit) => sensors.push({ id, name, hw, hwId: hw, hwType, type, unit, src: 'demo' });
    add('corsair:0c17/liquid', 'Kühlmittel', 'Corsair H115i Platinum', 'Cooler', 'Temperature', '°C');
    add('fps.current', 'Framerate', 'RivaTuner Statistics Server', 'Fps', 'Fps', 'FPS');
    add('fps.frametime', 'Frametime', 'RivaTuner Statistics Server', 'Fps', 'TimeSpan', 'ms');
    add('sys.ram.used', 'Arbeitsspeicher belegt', 'Windows', 'System', 'Data', 'GB');
    add('sys.net.down', 'Download', 'Netzwerk · Ethernet', 'Network', 'Throughput', 'B/s');
    add('sys.net.up', 'Upload', 'Netzwerk · Ethernet', 'Network', 'Throughput', 'B/s');
    const alias = (name, label, group, expr) => ({ name, label, group, expr, auto: true, error: null });
    const aliases = [
      alias('cpu.temp', 'CPU-Temperatur', 'Prozessor', '{lhm:/intelcpu/0/temperature/6}'),
      alias('cpu.load', 'CPU-Auslastung', 'Prozessor', '{lhm:/intelcpu/0/load/0}'),
      alias('cpu.pump', 'Pumpe', 'Prozessor', '{corsair:0c17/pump}'),
      alias('gpu.temp', 'GPU-Temperatur', 'Grafikkarte', '{lhm:/gpu-nvidia/0/temperature/0}'),
      alias('power.total', 'Leistung CPU + GPU', 'System', 'cpu.power + gpu.power'),
    ];
    return { type: 'catalog', sensors, aliases, status: { elevated: true, pawnio: true, rtss: true, ready: true, demo: true, haConnected: true, ha: 'verbunden' } };
  }

  function start() {
    if (!active) return;
    Sx.emit(catalog());
    // Verlauf vorab füllen, damit die Kurven sofort etwas zeigen.
    for (const [k, v] of Object.entries(values())) if (typeof v === 'number') Sx.track(k);
    for (const [id] of FANS) Sx.track(id);
    Sx.track('ha:sensor.netz_leistung', 10);
    for (let i = 0; i < 60; i++) {
      const wave = 1 + 1.4 * Math.exp(-(((i - 20) / 6) ** 2)) + 0.6 * Math.exp(-(((i - 41) / 3) ** 2));
      step(mode === 'gaming' && i < 22 ? 'normal' : mode, mode === 'gaming' ? 1 : wave);
      Sx.emit({ type: 'values', v: values() });
    }
    // Netzbezug: 10-Minuten-Verlauf vorab füllen (ein Punkt je 10 Sekunden).
    const gridHistory = Sx.history('ha:sensor.netz_leistung', 10);
    gridHistory.length = 0;
    for (let i = 0; i < 60; i++) gridHistory.push(Math.round(330 - i * 1.6 + 70 * Math.sin(i / 5) + (i > 14 && i < 19 ? 420 : 0) + (Math.random() - .5) * 50));
    setInterval(() => { step(mode); Sx.emit({ type: 'values', v: values() }); }, 1000);
    if (!Sx.isHost && document.getElementById('stage')) {
      // ?profil=/docs/beispiel-profil.json lädt ein anderes Profil (für Bilder und die Beispielseite).
      fetch(params.get('profil') || '../Profiles/standard.json')
        .then(r => r.json())
        .then(profile => Sx.emit({ type: 'profile', profile }))
        .catch(e => Sx.emit({ type: 'error', message: 'Profil nicht ladbar: ' + e.message }));
    }
    addEventListener('keydown', e => { if (e.key === 'g' || e.key === 'G') mode = mode === 'gaming' ? 'normal' : 'gaming'; });
  }

  return { active, start };
})();
