/* Split treatment for Watch and Screen. The demo tables use prototype data. */
export function mountSections(root, scope) {
  const {
    setTimeout,
    clearTimeout,
    requestAnimationFrame,
    addEventListener,
    observeIntersection,
    whenFontsReady,
  } = scope;
  const q = (s, r = root) => r.querySelector(s),
    qa = (s, r = root) => [...r.querySelectorAll(s)];
  const RMx = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SCR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%*+:-·@';
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
    ez = (t) => 1 - Math.pow(1 - cl(t), 3);
  const mb = (s) => () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nf = (n, d = 0) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const narrow = () => document.documentElement.classList.contains('lt820');
  const STOP = {};
  const IC = {
    s: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    w: '<svg class="i" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    go: '<svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>',
  };

  /* ---------- clocks: one per demo, ticking only while it is on screen ---------- */
  class Clock {
    constructor() {
      this.t = 0;
      this.on = false;
      this.w = [];
      this.g = 0;
    }
    sleep(ms) {
      if (RMx) return Promise.resolve();
      const g = this.g;
      return new Promise((res, rej) => this.w.push({ at: this.t + ms, res, rej, g }));
    }
    tick(dt) {
      if (this.on) this.t += dt;
      for (let i = this.w.length - 1; i >= 0; i--) {
        const w = this.w[i];
        if (w.g !== this.g) {
          this.w.splice(i, 1);
          w.rej(STOP);
        } else if (this.t >= w.at) {
          this.w.splice(i, 1);
          w.res();
        }
      }
    }
    kill() {
      this.g++;
      for (const pending of this.w.splice(0)) pending.rej(STOP);
    }
  }
  const demos = [];
  const io = observeIntersection(
    (es) =>
      es.forEach((e) => {
        const d = demos.find((x) => x.el === e.target);
        if (!d) return;
        d.c.on = e.isIntersecting;
        if (e.isIntersecting && !d.started && d.run) start(d, 0);
      }),
    { threshold: 0.2 },
  );
  function demo(el, run) {
    const d = { el, c: new Clock(), parts: [], started: false, run };
    demos.push(d);
    io.observe(el);
    return d;
  }
  function start(d, i) {
    d.started = true;
    d.parts = [];
    d.run(d, i).catch((e) => {
      if (e !== STOP) console.error(e);
    });
  }
  function restart(d, i) {
    d.c.kill();
    d.c.on = true;
    start(d, i);
  }
  function clearDemos() {
    demos.forEach((d) => {
      d.c.kill();
      io.unobserve(d.el);
    });
    demos.length = 0;
  }
  let last = performance.now();
  (function loop(n) {
    const dt = Math.min(64, n - last);
    last = n;
    if (!document.hidden)
      demos.forEach((d) => {
        d.c.tick(dt);
        if (d.c.on || RMx) d.parts.forEach((p) => p.frame(d.c.t));
      });
    requestAnimationFrame(loop);
  })(last);

  /* ---------- split-flap board ---------- */
  function compose(spec, vals, head) {
    const C = narrow() ? 40 : 58,
      gap = spec.gap ?? 1,
      cols = spec.cols.filter((c) => !narrow() || c.nar !== false);
    let s = '',
      k = [];
    cols.forEach((c, i) => {
      const w = c.w;
      let t = String(head ? c.l : (vals[c.k] ?? ''))
        .toUpperCase()
        .slice(0, w);
      const n = w - t.length;
      t = c.a === 'r' ? ' '.repeat(n) + t : t + ' '.repeat(n);
      s += t;
      const cc = head ? '' : c.col ? c.col(vals) : '';
      for (let j = 0; j < w; j++) k.push(cc);
      if (i < cols.length - 1) {
        s += ' '.repeat(gap);
        for (let j = 0; j < gap; j++) k.push('');
      }
    });
    return [s.padEnd(C).slice(0, C), k];
  }
  class Flap {
    constructor(host, d, n, spec) {
      this.d = d;
      this.spec = spec;
      this.C = narrow() ? 40 : 58;
      this.act = new Set();
      this.rows = [];
      host.innerHTML = '';
      host.style.setProperty('--C', this.C);
      for (let r = 0; r < n; r++) {
        const row = document.createElement('div');
        row.className = 'brow' + (r ? '' : ' h');
        const cells = [];
        for (let c = 0; c < this.C; c++) {
          const i = document.createElement('i');
          i.textContent = ' ';
          row.appendChild(i);
          cells.push({ el: i, ch: ' ', cl: '', tch: ' ', tcl: '', s0: 0, s1: 0, lt: 0 });
        }
        host.appendChild(row);
        this.rows.push({ el: row, cells });
      }
      d.parts.push(this);
    }
    head() {
      return compose(this.spec, null, true);
    }
    row(v) {
      return compose(this.spec, v);
    }
    blank() {
      return [' '.repeat(this.C), []];
    }
    put(k, ch, c) {
      if (k.ch !== ch) {
        k.el.textContent = ch;
        k.ch = ch;
      }
      if (k.cl !== c) {
        k.el.className = c;
        k.cl = c;
      }
    }
    flap(r, [text, cls], o = {}) {
      const row = this.rows[r];
      if (!row) return;
      const t = this.d.c.t,
        d = o.delay || 0,
        dur = o.dur ?? 900,
        cs = o.cs ?? 10,
        j = o.j ?? 220;
      row.cells.forEach((k, c) => {
        k.tch = text[c] || ' ';
        k.tcl = cls[c] || '';
        if (RMx) {
          this.put(k, k.tch, k.tcl);
          return;
        }
        k.s0 = t + d + Math.random() * 120;
        k.s1 = t + d + dur * 0.35 + c * cs + Math.random() * j;
        this.act.add(k);
      });
    }
    frame(t) {
      for (const k of this.act) {
        if (t >= k.s1) {
          this.put(k, k.tch, k.tcl);
          this.act.delete(k);
        } else if (t >= k.s0 && t - k.lt > 55) {
          k.lt = t;
          this.put(k, Math.random() < 0.15 ? ' ' : SCR[(Math.random() * SCR.length) | 0], 'x');
        }
      }
    }
    mark(hi, dim) {
      this.rows.forEach((r, i) => {
        if (!i) return;
        r.el.classList.toggle('hi', hi.includes(i));
        r.el.classList.toggle('dim', dim && !hi.includes(i));
      });
    }
  }

  /* =====================================================================
   DATA (made up)
   ===================================================================== */
  const W = {
    lab: '[ WATCH ]',
    h: 'Say “tell me when”. It keeps watching.',
    lede: 'Your agent writes the check. /markets runs it every minute, even after the chat closes, and messages you when it hits.',
    facts: 'Every minute · NSE and MCX · Hinglish works too',
  };
  const S = {
    lab: '[ SCREEN ]',
    h: 'Screen options, stocks and commodities.',
    lede: 'Say the rule the way you’d say it. The code runs over every symbol on /markets, and only the matches go back to your agent.',
    facts: '4,812 stock options · 186 F&amp;O stocks · 24 MCX contracts',
  };

  const WEX = [
    {
      q: 'Tell me when Crude breaks yesterday’s low',
      row: { n: '1 min', s: 'CrudeOil Dec', r: 'Breaks PDL', l: '5,742', st: 'WATCHING' },
      kind: 'down',
      seed: 3,
      start: 5800,
      vol: 6,
      level: 5742,
      sym: 'CRUDEOIL DEC · MCX',
      tf: '5 MIN',
      lvlLab: 'YOUR LEVEL · 5,742 · YESTERDAY’S LOW',
      hit: '14:30',
      px: '5,738',
      msg: 'Crude broke yesterday’s low. 5,738 now. Your level was 5,742.',
      checks: [
        ['13:31', '5,786'],
        ['13:32', '5,781'],
        ['13:33', '5,779'],
      ],
      short: 'Crude below 5,742',
      ans: 'Watching CRUDEOIL Dec for a break below 5,742, yesterday’s low. You get a message when it happens.',
      out: 'checked  13:33\nlow      5779.0\npdl      5742.0\nhit      False',
      code: '@watch(every="1m", until="23:30")\ndef crude_pdl():\n    c = candles("MCX:CRUDEOIL25DECFUT", "5m", today=True)\n    pdl = daily("MCX:CRUDEOIL25DECFUT").low[-2]\n    if c.low[-1] < pdl:\n        send(f"Crude broke yesterday\'s low. {c.close[-1]} now.")',
    },
    {
      q: 'Ping me if Nifty gaps down 1% tomorrow',
      row: { n: '09:16', s: 'Nifty fut', r: 'Gaps down 1%', l: '24,716', st: 'WATCHING' },
      kind: 'gap',
      seed: 9,
      start: 23800,
      vol: 90,
      drift: 18,
      level: 24716,
      sym: 'NIFTY DEC FUT',
      tf: 'DAILY',
      lvlLab: '−1% FROM CLOSE · 24,716',
      hit: '09:16',
      px: '24,700',
      msg: 'Nifty opened 1.07% down at 24,700. Your level was 24,716.',
      checks: [
        ['Thu 15:30', '24,966'],
        ['Fri 09:08', 'pre-open'],
        ['Fri 09:15', '24,731'],
      ],
      short: 'Nifty gap down 1%',
      ans: 'Watching Nifty Dec fut for a 1% gap down at tomorrow’s open, below 24,716.',
      out: 'prev_close  24966.25\nlevel       24716.59\nopen        pre-open\nhit         False',
      code: '@watch(at="09:16")\ndef nifty_gap():\n    d = daily("NSE:NIFTY25DECFUT")\n    if d.open[-1] <= d.close[-2] * 0.99:\n        send(f"Nifty opened {d.open[-1]}, a gap down.")',
    },
    {
      q: 'BankNifty 15 min range tode toh bata dena',
      row: { n: '1 min', s: 'BankNifty', r: 'Breaks 15m range', l: '53,620', st: 'WATCHING' },
      kind: 'range',
      seed: 4,
      vol: 18,
      sym: 'BANKNIFTY DEC FUT',
      tf: '5 MIN',
      lvlLab: '15-MIN RANGE · 53,410 – 53,620',
      hit: '10:05',
      px: '53,644',
      msg: 'BankNifty broke the 15-min high. 53,644 now. Range was 53,410 – 53,620.',
      checks: [
        ['09:58', '53,571'],
        ['10:01', '53,598'],
        ['10:04', '53,612'],
      ],
      short: 'BankNifty 15m range',
      ans: 'Watching BankNifty Dec fut for a break of the first 15 minutes: 53,410 – 53,620.',
      out: 'range_high  53620.0\nrange_low   53410.0\nlast        53612.0\nhit         False',
      code: '@watch(every="1m", start="09:30", until="15:30")\ndef bn_orb():\n    c = candles("NSE:BANKNIFTY25DECFUT", "5m", today=True)\n    hi, lo = c.high[:3].max(), c.low[:3].min()\n    if c.close[-1] > hi or c.close[-1] < lo:\n        send(f"BankNifty broke the 15-min range. {c.close[-1]} now.")',
    },
  ];
  const WROWS = [
    ['08:00', '8 AM brief', 'NSE + MCX summary', '—', 'Sent'],
    ['09:30', 'Reliance', 'Crosses 200 EMA', '1,262', 'Watching'],
    ['10:00', 'SilverMic', 'RSI(14) under 30', '30', 'Watching'],
    ['1 min', 'GoldM Dec', 'Breaks PDH', '76,410', 'Watching'],
    ['13:00', 'SBIN', 'Closes above PDH', '851', 'Watching'],
    ['EOD', 'Holdings', 'Down 2% on day', '-2.0%', 'Watching'],
    ['15:25', 'HDFCBank', 'Wave 3 target', '1,780', 'Watching'],
  ].map(([n, s, r, l, st]) => ({ n, s, r, l, st: st.toUpperCase() }));
  const WSPEC = {
    gap: 1,
    cols: [
      { k: 'n', l: 'Next', w: 6, col: () => 'b' },
      { k: 's', l: 'Symbol', w: 12 },
      { k: 'r', l: 'Rule', w: 16, nar: false, col: () => 'b' },
      { k: 'l', l: 'Level', w: 8, a: 'r', col: () => 'p' },
      {
        k: 'st',
        l: 'Status',
        w: 11,
        col: (v) => (v.st === 'WATCHING' ? 'm' : v.st.startsWith('HIT') ? '' : 'mu'),
      },
    ],
  };

  const ud = (v) => (v.g[0] === '+' ? 'u' : 'd');
  const OPTU = [
    ['NIFTY', 24800],
    ['BANKNIFTY', 53500],
    ['RELIANCE', 1300],
    ['HDFCBANK', 1740],
    ['INFY', 1880],
    ['ICICIBANK', 1320],
    ['SBIN', 850],
    ['TCS', 4100],
    ['ITC', 450],
    ['LT', 3700],
    ['AXISBANK', 1150],
    ['MARUTI', 13000],
    ['HCLTECH', 1750],
    ['SUNPHARMA', 1800],
    ['KOTAKBANK', 1900],
    ['BHARTIARTL', 1700],
    ['TATASTEEL', 150],
    ['WIPRO', 300],
    ['ONGC', 250],
    ['NTPC', 350],
    ['M&M', 3100],
    ['TITAN', 3500],
    ['ADANIENT', 2400],
    ['ASIANPAINT', 2300],
  ].map(([u, k], i) => {
    const r = mb(50 + i),
      ic = (r() - 0.5) * 4,
      oc = (r() - 0.45) * 20;
    return {
      s: `${u} ${k} ${r() < 0.5 ? 'CE' : 'PE'}`,
      p: nf(5 + r() * 150, 2),
      iv: (12 + r() * 20).toFixed(1),
      ic: (ic > 0 ? '+' : '') + ic.toFixed(1),
      oc: (oc > 0 ? '+' : '') + oc.toFixed(0) + '%',
      x: i < 2 ? '27NOV' : '30DEC',
    };
  });
  const OPTM = [
    ['TATAMOTORS 720 PE', '18.40', 41.2, 6.8, '+22%'],
    ['DIXON 16000 CE', '412.00', 38.9, 6.1, '+15%'],
    ['SBIN 840 PE', '14.25', 29.7, 5.6, '+31%'],
    ['BAJFINANCE 7200 PE', '162.50', 33.4, 5.4, '+12%'],
    ['INDIGO 4600 CE', '96.10', 36.0, 5.2, '+9%'],
    ['TRENT 7000 CE', '188.30', 44.7, 5.1, '+18%'],
  ].map(([s, p, iv, ic, oc]) => ({
    s,
    p,
    iv: iv.toFixed(1),
    ic: '+' + ic.toFixed(1),
    oc,
    x: '30DEC',
    xv: iv,
    yv: ic,
  }));
  const SYM =
    'AARTIIND CHEM|ABB CAP GOODS|ABCAPITAL NBFC|ADANIENT METALS|ADANIPORTS INFRA|ALKEM PHARMA|AMBUJACEM CEMENT|APOLLOHOSP HEALTH|ASHOKLEY AUTO|ASIANPAINT CONSUMER|AUBANK BANKS|AUROPHARMA PHARMA|BAJAJ-AUTO AUTO|BALKRISIND AUTO|BANDHANBNK BANKS|BANKBARODA BANKS|BEL DEFENCE|BHARATFORG AUTO|BHEL CAP GOODS|BIOCON PHARMA|BPCL ENERGY|BRITANNIA FMCG|CANBK BANKS|CHOLAFIN NBFC'
      .split('|')
      .map((x, i) => {
        const r = mb(100 + i),
          [s, ...z] = x.split(' '),
          ch = (r() - 0.5) * 5,
          e = (r() - 0.55) * 30;
        return {
          s,
          c: nf(80 + r() * 8000, 2),
          g: (ch > 0 ? '+' : '') + ch.toFixed(2) + '%',
          v: (0.4 + r() * 1.5).toFixed(1) + '×',
          e: (e > 0 ? '+' : '') + e.toFixed(1) + '%',
          z: z.join(' '),
        };
      });
  const STKM = [
    ['DIXON', '15,860.00', '+3.12%', 3.8, 14.2, 'CONS DUR'],
    ['FEDERALBNK', '212.35', '+1.94%', 3.4, 8.8, 'BANKS'],
    ['HCLTECH', '1,742.30', '+1.62%', 3.1, 7.9, 'IT'],
    ['TRENT', '6,912.00', '+2.40%', 2.8, 12.6, 'RETAIL'],
    ['LT', '3,688.00', '+0.49%', 2.6, 3.1, 'CAP GOODS'],
    ['SUNPHARMA', '1,804.60', '+1.08%', 2.5, 5.1, 'PHARMA'],
    ['INFY', '1,866.90', '+1.31%', 2.4, 6.2, 'IT'],
    ['BHARTIARTL', '1,688.20', '+0.34%', 2.3, 9.4, 'TELECOM'],
    ['POLYCAB', '7,240.50', '+1.21%', 2.2, 6.7, 'CAP GOODS'],
    ['ICICIBANK', '1,318.45', '+0.52%', 2.2, 5.4, 'BANKS'],
    ['MARUTI', '12,940.10', '+0.95%', 2.1, 4.8, 'AUTO'],
    ['KOTAKBANK', '1,912.75', '+0.71%', 2.0, 2.2, 'BANKS'],
  ].map(([s, c, g, v, e, z]) => ({
    s,
    c,
    g,
    v: v.toFixed(1) + '×',
    e: '+' + e.toFixed(1) + '%',
    z,
    xv: e,
    yv: v,
  }));
  const MCXU = [
    'GOLD DEC',
    'GOLDM DEC',
    'GOLD FEB',
    'SILVERM NOV',
    'SILVER MAR',
    'CRUDEOIL DEC',
    'CRUDEOILM',
    'NATGAS DEC',
    'NATGASMINI',
    'ALUMINI DEC',
    'LEAD DEC',
    'ZINCMINI',
    'LEADMINI',
    'ALUMINIUM',
    'COPPER FEB',
    'GOLDGUINEA',
    'GOLDPETAL',
    'SILVERMIC',
    'CRUDEOIL JAN',
    'NATGAS JAN',
    'ZINC JAN',
    'LEAD JAN',
    'GOLD APR',
    'SILVER MAY',
  ].map((s, i) => {
    const r = mb(200 + i),
      g = (r() - 0.55) * 3,
      h = -(r() * 1.6 + 0.05),
      o = (r() - 0.5) * 8,
      z = ['—', 'INSIDE DAY', 'BELOW PDL'][Math.floor(r() * 3)];
    return {
      s,
      p: nf(200 + r() * 90000, 2),
      g: (g > 0 ? '+' : '') + g.toFixed(2) + '%',
      h: h.toFixed(2) + '%',
      o: (o > 0 ? '+' : '') + o.toFixed(1) + '%',
      z,
    };
  });
  const MCXM = [
    ['SILVER DEC', '98,450.00', '+1.84%', '+0.54%', '+6.2%'],
    ['COPPER DEC', '842.30', '+1.12%', '+0.50%', '+4.8%'],
    ['GOLDM DEC', '76,612.00', '+0.61%', '+0.26%', '+3.1%'],
    ['ZINC DEC', '268.45', '+0.95%', '+0.58%', '+2.4%'],
  ].map(([s, p, g, h, o]) => ({ s, p, g, h, o, z: 'ABOVE PDH' }));
  const MKS = [
    {
      tab: 'Options',
      q: 'Stock options where IV jumped 5 points today',
      n: '4,812',
      uni: OPTU,
      match: OPTM,
      spec: {
        gap: 1,
        cols: [
          { k: 's', l: 'Contract', w: 18 },
          { k: 'p', l: 'LTP', w: 8, a: 'r' },
          { k: 'iv', l: 'IV', w: 5, a: 'r' },
          { k: 'ic', l: 'IV chg', w: 6, a: 'r', col: (v) => (v.ic[0] === '+' ? '' : 'b') },
          { k: 'oc', l: 'OI chg', w: 7, a: 'r', nar: false, col: () => 'b' },
          { k: 'x', l: 'Expiry', w: 6, nar: false, col: () => 'mu' },
        ],
      },
      title: '6 of 4,812 stock options',
      sub: 'IV up 5+ points today · 21 Nov close',
      ans: '6 of 4,812 stock options jumped 5 or more IV points today.',
      h: ['Contract', 'LTP', 'IV', 'IV chg'],
      row: (m) => [m.s, m.p, m.iv, m.ic],
      note: 'Every stock option, all strikes, Dec expiry.',
      rc: ['4,812 contracts', 'read here', '61 tokens', 'sent to your agent'],
      out: 'contracts  4812\nmatched    6\nTATAMOTORS 720PE   iv 41.2  +6.8\nDIXON 16000CE      iv 38.9  +6.1\nSBIN 840PE         iv 29.7  +5.6',
      code: 'rows = []\nfor c in option_chain(stocks=True, expiry="2026-12-30"):\n    jump = c.iv - c.iv_prev_close\n    if jump >= 5:\n        rows.append((c.symbol, c.iv, jump))\nprint(len(rows), sorted(rows, key=lambda r: -r[2]))',
    },
    {
      tab: 'Stocks',
      q: 'F&O stocks above the 200 EMA on 2× volume',
      n: '186',
      uni: SYM,
      match: STKM,
      spec: {
        gap: 1,
        cols: [
          { k: 's', l: 'Symbol', w: 11 },
          { k: 'c', l: 'Close', w: 10, a: 'r', nar: false },
          { k: 'g', l: 'Chg', w: 7, a: 'r', col: ud },
          { k: 'v', l: 'Vol ×', w: 5, a: 'r', col: (v) => (parseFloat(v.v) >= 2 ? '' : 'b') },
          { k: 'e', l: 'vs EMA', w: 8, a: 'r', col: (v) => (v.e[0] === '+' ? '' : 'b') },
          { k: 'z', l: 'Sector', w: 9, nar: false, col: () => 'mu' },
        ],
      },
      title: '12 of 186 F&amp;O stocks',
      sub: 'Above the 200 EMA on 2× volume · 21 Nov close',
      ans: '12 of 186 F&amp;O stocks closed above the 200 EMA on 2× average volume.',
      h: ['Symbol', 'Close', 'Vol ×', 'vs 200 EMA'],
      row: (m) => [m.s, m.c, m.v, m.e],
      note: 'All 186 F&amp;O stocks, daily candles.',
      rc: ['37,200 candles', 'read here', '96 tokens', 'sent to your agent'],
      out: 'scanned  186\nmatched  12\nDIXON       vol 3.8x  ema +14.2%\nFEDERALBNK  vol 3.4x  ema +8.8%\nHCLTECH     vol 3.1x  ema +7.9%',
      code: 'rows = []\nfor s in fno_stocks():\n    d = candles(s, "1d", 220)\n    ema = d.close.ewm(span=200).mean()\n    if d.close[-1] > ema[-1] and d.volume[-1] >= 2 * d.volume[-21:-1].mean():\n        rows.append(s)\nprint(len(rows), rows)',
    },
    {
      tab: 'Commodities',
      q: 'MCX contracts above yesterday’s high, OI rising',
      n: '24',
      uni: MCXU,
      match: MCXM,
      spec: {
        gap: 1,
        cols: [
          { k: 's', l: 'Contract', w: 12 },
          { k: 'p', l: 'LTP', w: 10, a: 'r', nar: false },
          { k: 'g', l: 'Chg', w: 7, a: 'r', col: ud },
          { k: 'h', l: 'vs PDH', w: 8, a: 'r', col: (v) => (v.h[0] === '+' ? '' : 'b') },
          { k: 'o', l: 'OI chg', w: 7, a: 'r', col: () => 'b' },
          { k: 'z', l: 'Signal', w: 9, nar: false, col: (v) => (v.z === 'ABOVE PDH' ? 'u' : 'mu') },
        ],
      },
      title: '4 of 24 MCX contracts',
      sub: 'Above yesterday’s high, OI rising · 21 Nov',
      ans: '4 of 24 MCX contracts closed above yesterday’s high with open interest rising.',
      h: ['Contract', 'LTP', 'vs PDH', 'OI chg'],
      row: (m) => [m.s, m.p, m.h, m.o],
      note: 'Every active MCX contract, daily candles and OI.',
      rc: ['24 contracts', 'read here', '38 tokens', 'sent to your agent'],
      out: 'contracts  24\nmatched    4\nSILVER DEC   +0.54% over pdh  oi +6.2%\nCOPPER DEC   +0.50% over pdh  oi +4.8%\nGOLDM DEC    +0.26% over pdh  oi +3.1%',
      code: 'rows = []\nfor c in mcx_contracts(active=True):\n    d = candles(c, "1d", 2)\n    oi = open_interest(c, days=2)\n    if d.close[-1] > d.high[-2] and oi[-1] > oi[-2]:\n        rows.append(c)\nprint(len(rows), rows)',
    },
  ];

  /* =====================================================================
   shared bits
   ===================================================================== */
  const txtH = (o) =>
    `<span class="lab2">${o.lab}</span><h2>${o.h}</h2><p class="lede">${o.lede}</p><p class="facts">${o.facts}</p>`;
  const exH = (list, row) =>
    `<div class="exs${row ? ' row' : ''}">${row ? '' : '<span class="lab">Try</span>'}${list.map((t, i) => `<button class="ex" data-i="${i}">${t}</button>`).join('')}</div>`;
  const pqH = (w) =>
    `<div class="pq"><span class="schip${w ? ' w' : ''}">${w ? IC.w + 'Watch' : IC.s + 'Search markets'}</span><span class="qt2"><b></b><i></i></span><span class="go">${IC.go}</span></div>`;
  const rcH = (f) => `<span><b>${f[0]}</b> ${f[1]}</span><span class="to"><b>${f[2]}</b> ${f[3]}</span>`;
  const segH = () =>
    `<div class="seg">${MKS.map((m, i) => `<button data-i="${i}">${m.tab}</button>`).join('')}</div>`;
  const WQ = WEX.map((e) => e.q),
    SQ = MKS.map((m) => m.q);
  async function type(d, el, s) {
    if (RMx) {
      el.textContent = s;
      return;
    }
    el.textContent = '';
    for (let i = 1; i <= s.length; i++) {
      el.textContent = s.slice(0, i);
      await d.c.sleep(20 + Math.random() * 24);
    }
    await d.c.sleep(220);
  }
  async function erase(d, el) {
    if (RMx) return;
    let t = el.textContent;
    while (t.length) {
      t = t.slice(0, -3);
      el.textContent = t;
      await d.c.sleep(12);
    }
    await d.c.sleep(200);
  }
  function press(box) {
    const g = q('.go', box);
    g.classList.add('press');
    box.classList.remove('pulse');
    void box.offsetWidth;
    box.classList.add('pulse');
    setTimeout(() => g.classList.remove('press'), 160);
  }
  function exOn(sec, i) {
    qa('.ex', sec).forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    qa('.seg button', sec).forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  }
  function wire(d) {
    qa('.ex,.seg button', d.el).forEach((b) => (b.onclick = () => restart(d, +b.dataset.i)));
  }

  /* =====================================================================
   1 · SPLIT: text on one side, a live split-flap board on the other
   ===================================================================== */
  const V1 = {
    name: 'Split',
    html: () => `<section class="sec split" id="sw"><div class="txt">${txtH(W)}${exH(WQ)}</div>
      <div class="panel">${pqH(true)}<div class="fb"></div><div class="chk"></div><div class="toast"></div></div></section>
    <section class="sec split rev" id="ss"><div class="txt">${txtH(S)}${exH(SQ)}</div>
      <div class="panel"><div class="pbar">${segH()}<span class="cnt"></span></div>${pqH(false)}<div class="fb"></div><div class="rc off"></div></div></section>`,
    wire() {
      wire(demo(q('#sw'), runW1));
      wire(demo(q('#ss'), runS1));
    },
  };
  async function runW1(d, k0) {
    const P = q('.panel', d.el),
      F = new Flap(q('.fb', P), d, 8, WSPEC),
      qt = q('.qt2 b', P),
      chk = q('.chk', P),
      T = q('.toast', P);
    let rows = WROWS.slice();
    qt.textContent = '';
    T.classList.remove('on');
    F.flap(0, F.head(), { dur: 400 });
    rows.forEach((r, i) => F.flap(i + 1, F.row(r), { delay: 120 + i * 60, dur: 900 }));
    chk.innerHTML = '<span>7 watches · checking every minute</span><span></span>';
    await d.c.sleep(1500);
    for (let k = k0; ; k++) {
      const i = k % WEX.length,
        ex = WEX[i];
      exOn(d.el, i);
      await type(d, qt, ex.q);
      press(P);
      rows = [ex.row, ...rows.slice(0, 6)];
      rows.forEach((r, j) =>
        F.flap(
          j + 1,
          F.row(r),
          j ? { dur: 380, cs: 3, j: 80, delay: j * 28 } : { dur: 1100, cs: 10, j: 200 },
        ),
      );
      await d.c.sleep(1000);
      F.mark([1], true);
      for (const [t, p] of ex.checks) {
        chk.innerHTML = `<span>checked ${t} · ${p}</span><span>no hit</span>`;
        await d.c.sleep(700);
      }
      rows[0] = { ...ex.row, st: 'HIT · SENT' };
      F.flap(1, F.row(rows[0]), { dur: 500, cs: 4 });
      chk.innerHTML = `<span>checked ${ex.hit} · ${ex.px}</span><b>hit · sent</b>`;
      T.innerHTML = `<small>${ex.hit} · TO YOUR PHONE</small><p>${ex.msg}</p>`;
      T.classList.add('on');
      if (RMx) return;
      await d.c.sleep(3400);
      T.classList.remove('on');
      F.mark([], false);
      await erase(d, qt);
      await d.c.sleep(500);
    }
  }
  async function runS1(d, k0) {
    const P = q('.panel', d.el),
      qt = q('.qt2 b', P),
      cnt = q('.cnt', P),
      rc = q('.rc', P),
      F = new Flap(q('.fb', P), d, 9, MKS[k0 % 3].spec);
    for (let k = k0; ; k++) {
      const i = k % 3,
        m = MKS[i];
      exOn(d.el, i);
      rc.classList.add('off');
      F.spec = m.spec;
      F.mark([], false);
      qt.textContent = '';
      F.flap(0, F.head(), { dur: 400 });
      m.uni.slice(0, 8).forEach((r, j) => F.flap(j + 1, F.row(r), { delay: 100 + j * 50, dur: 800 }));
      cnt.textContent = `1–8 of ${m.n}`;
      await d.c.sleep(1200);
      await type(d, qt, m.q);
      press(P);
      for (const pg of [1, 2]) {
        m.uni
          .slice(pg * 8, pg * 8 + 8)
          .forEach((r, j) => F.flap(j + 1, F.row(r), { dur: 380, cs: 3, j: 70, delay: j * 18 }));
        cnt.textContent = `${pg * 8 + 1}–${pg * 8 + 8} of ${m.n}`;
        await d.c.sleep(480);
      }
      const mm = m.match.slice(0, 8);
      for (let j = 0; j < 8; j++)
        F.flap(j + 1, mm[j] ? F.row(mm[j]) : F.blank(), { dur: 700, cs: 6, j: 140, delay: j * 30 });
      cnt.textContent = `${m.match.length} of ${m.n} match`;
      await d.c.sleep(1000);
      F.mark(
        mm.map((_, j) => j + 1),
        false,
      );
      rc.innerHTML = rcH(m.rc);
      rc.classList.remove('off');
      if (RMx) return;
      await d.c.sleep(3800);
      await erase(d, qt);
    }
  }

  const sections = q('#secs');
  function renderSections() {
    clearDemos();
    sections.innerHTML = V1.html();
    V1.wire();
  }
  let resizeTimer = 0;
  let width = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (innerWidth === width) return;
      width = innerWidth;
      renderSections();
    }, 300);
  });
  whenFontsReady(() => {
    renderSections();
    if (location.hash === '#secs') sections.scrollIntoView();
  });
  return clearDemos;
}
