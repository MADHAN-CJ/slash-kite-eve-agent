export function mountHero(root, scope) {
  const {
    setTimeout,
    clearTimeout,
    setInterval,
    requestAnimationFrame,
    addEventListener,
    observeIntersection,
    whenFontsReady,
  } = scope;
  /* hero.js: the hero. Depth book, Receipt pulse, the playground (sample answers as of the 21 Nov close), fitPage(). */
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Narrow desktop windows (like the app's side pane) get the 1440 layout scaled down,
   so the order book stays visible. Phones and touch screens keep the responsive layout.
   Add ?fit=0 to turn this off. */
  /* On touch screens, wide content can stretch innerWidth past the real screen at load, so cap it. */
  let Z = 1;
  const EW = () =>
    (matchMedia('(pointer:coarse)').matches ? Math.min(innerWidth, screen.width || innerWidth) : innerWidth) /
    Z;
  function fitPage() {
    const desk =
      !matchMedia('(pointer:coarse)').matches &&
      innerWidth >= 600 &&
      innerWidth < 1240 &&
      !/[?&]fit=0/.test(location.search);
    Z = desk ? innerWidth / 1440 : 1;
    document.documentElement.style.zoom = Z === 1 ? '' : Z;
    const w = EW(),
      c = document.documentElement.classList;
    c.toggle('lt1100', w < 1100);
    c.toggle('lt980', w < 980);
    c.toggle('lt820', w < 820);
  }
  fitPage();
  addEventListener('resize', fitPage);

  /* ---------- sample questions (all numbers made up) ----------
   Each run is four real objects: the program the agent wrote (code), what it read on
   /markets (raw, never sent), what it printed (out = stdout, the only thing the agent
   gets back), and the answer the agent gives. */
  const Q = {
    gap: {
      mode: 'ask',
      chip: 'Nifty gap-downs: how often green?',
      q: 'Nifty gap-downs over 1%: how often did it close green?',
      ans: '41 gap-downs since Jan 2023. Nifty closed green on <b>17</b> of them (41%).',
      meta: 'NIFTY 50 · daily · median −0.6%',
      rows: [
        ['28 Oct 2026', 'Opened 1.3% below the prior close', '+0.4% ▲', 'u'],
        ['07 Aug 2026', 'Opened 1.1% below the prior close', '−0.9% ▼', 'd'],
        ['14 May 2026', 'Opened 1.8% below the prior close', '+1.1% ▲', 'u'],
      ],
      chart: {
        title: 'NIFTY 50 · 1D',
        base: 25400,
        vol: 0.009,
        n: 56,
        seed: 7,
        gaps: [12, 31, 47],
        sub: 'gap-downs marked',
      },
      chartIn: false,
      tool: 'run_python',
      t: '0.6s',
      tok: 52,
      read: '961 daily candles',
      size: '2.1 MB',
      short: '961 candles',
      code: `from markets import candles

d = candles("NIFTY 50", "1d", since="2023")
gap = d.open / d.close.shift() - 1
g = d[gap < -0.01]
ret = g.close / g.open - 1

up = ret > 0

print("gap_downs ", len(g))
print("green     ", up.sum())
print("pct_green ", f"{up.mean():.1%}")
print("median_ret", f"{ret.median():.2%}")
print(ret.tail(3).round(3))`,
      out: `gap_downs  41
green      17
pct_green  41.5%
median_ret -0.62%
2026-05-14    0.011
2026-08-07   -0.009
2026-10-28    0.004`,
      raw: {
        cols: ['date', 'open', 'high', 'low', 'close'],
        rows: [
          ['2023-01-02', '18,131', '18,215', '18,086', '18,197'],
          ['2023-01-03', '18,163', '18,251', '18,149', '18,232'],
          ['2023-01-04', '18,230', '18,243', '18,020', '18,043'],
          ['2023-01-05', '18,101', '18,120', '17,892', '17,992'],
        ],
        more: '+ 957 more rows',
      },
      cap: '<b>961 daily candles, 2.1 MB.</b> The program read them here. None of it went to your agent.',
    },
    ema: {
      mode: 'ask',
      chip: 'Silver Mini 20 EMA, 1-hour',
      q: 'Silver Mini: where is the 20 EMA on the 1-hour chart?',
      ans: 'The 1-hour 20 EMA is at <b>₹96,240</b>. Last price is ₹410 above it.',
      meta: 'SILVERM · MCX · 1h',
      rows: [
        ['20 EMA (1h)', 'Exponential moving average, 20 periods', '₹96,240', 'n'],
        ['Last price', 'Up 0.4% on the day', '₹96,650', 'u'],
        ['Distance', 'Price above the EMA for 6 candles', '+0.43%', 'u'],
      ],
      chart: {
        title: 'SILVERM · 1H',
        base: 95600,
        vol: 0.0035,
        n: 56,
        seed: 21,
        trend: 0.0006,
        ema: 20,
        sub: '20 EMA in blue',
      },
      chartIn: true,
      tool: 'run_python',
      t: '0.4s',
      tok: 26,
      read: '196 hourly candles',
      size: '0.4 MB',
      short: '196 candles',
      code: `from markets import candles, ema

c = candles("SILVERM", "1h", days=14)
c["e20"] = ema(c.close, 20)
last = c.iloc[-1]
above = (c.close > c.e20)[::-1].cummin().sum()

print("ema20", round(last.e20))
print("last ", last.close)
print("diff ", round(last.close - last.e20))
print("above", above, "candles")`,
      out: `ema20 96240
last  96650
diff  410
above 6 candles`,
      raw: {
        cols: ['time', 'open', 'high', 'low', 'close'],
        rows: [
          ['10 Nov 10:00', '94,980', '95,140', '94,910', '95,102'],
          ['10 Nov 11:00', '95,102', '95,260', '95,040', '95,214'],
          ['10 Nov 12:00', '95,214', '95,230', '95,020', '95,066'],
          ['10 Nov 13:00', '95,066', '95,188', '94,996', '95,170'],
        ],
        more: '+ 192 more rows',
      },
      cap: '<b>196 hourly candles, 0.4 MB.</b> The EMA ran here, with a pre-built function. Only 4 lines went back.',
    },
    straddle: {
      mode: 'ask',
      chip: 'Nifty straddle kitna move price kar raha hai?',
      q: 'Nifty weekly straddle kitna move price kar raha hai?',
      ans: 'ATM 26,000 straddle costs <b>₹284</b>. That prices a move of about <b>±1.1%</b> by Tuesday’s expiry.',
      meta: 'NIFTY · weekly options · ATM 26,000',
      rows: [
        ['26000 CE', 'Call premium', '₹146', 'n'],
        ['26000 PE', 'Put premium', '₹138', 'n'],
        ['Range', '25,716 to 26,284 by expiry', '±284', 'n'],
      ],
      chart: {
        title: 'NIFTY 50 · 1H',
        base: 25820,
        vol: 0.0025,
        n: 48,
        seed: 3,
        trend: 0.0002,
        band: [25716, 26284],
        sub: 'straddle range shaded',
      },
      chartIn: true,
      tool: 'run_python',
      t: '0.7s',
      tok: 38,
      read: '182 strikes, the full chain',
      size: '0.9 MB',
      short: '182 strikes',
      code: `from markets import chain

ch = chain("NIFTY", expiry="weekly")
atm = ch.atm()
s = atm.ce.ltp + atm.pe.ltp
lo, hi = atm.strike - s, atm.strike + s

print("atm     ", atm.strike)
print("ce, pe  ", atm.ce.ltp, atm.pe.ltp)
print("straddle", s, f"(±{s / ch.spot:.2%})")
print("range   ", lo, hi)`,
      out: `atm      26000
ce, pe   146.0 138.0
straddle 284.0 (±1.09%)
range    25716.0 26284.0`,
      raw: {
        cols: ['strike', 'ce ltp', 'ce oi', 'pe ltp', 'pe oi'],
        rows: [
          ['25,900', '212', '18.4L', '92', '31.2L'],
          ['25,950', '178', '22.1L', '113', '26.7L'],
          ['26,000', '146', '41.8L', '138', '39.5L'],
          ['26,050', '118', '29.3L', '164', '17.2L'],
        ],
        more: '+ 178 more strikes',
      },
      cap: '<b>182 strikes, 0.9 MB.</b> The whole chain was read here. Your agent got the straddle, not the chain.',
    },
    crude: {
      mode: 'watch',
      chip: 'Watch Crude below yesterday’s low',
      q: 'Crude: tell me when a 15-min candle closes below yesterday’s low',
      ans: 'Watch set. It checks every 15 minutes, 9:00 to 23:30. Yesterday’s low was <b>₹5,412</b>.',
      meta: 'CRUDEOIL · MCX · 15m · keeps running after this chat closes',
      rows: [
        ['Last check 14:15', 'Close ₹5,448, above the low. Not hit.', 'waiting', 'n'],
        ['Next check 14:30', 'Same script, on a schedule', 'in 12m', 'n'],
        ['Sends to', 'WhatsApp and email', '2 places', 'n'],
      ],
      chart: {
        title: 'CRUDEOIL · 15M',
        base: 5470,
        vol: 0.0022,
        n: 56,
        seed: 11,
        trend: -0.0003,
        pdl: 5412,
        sub: 'yesterday’s low dashed',
      },
      chartIn: true,
      tool: 'create_alert',
      t: '0.5s',
      tok: 42,
      read: '3 candles, every 15 min',
      size: 'each check',
      short: '3 candles / check',
      code: `from markets import candles, watch

@watch("15m", between=("09:00", "23:30"))
def below_pdl():
    d = candles("CRUDEOIL", "1d", n=2)
    c = candles("CRUDEOIL", "15m", n=1)
    if c.close[-1] < d.low[-2]:
        return f"Crude {c.close[-1]} below PDL"`,
      out: `watch  below_pdl
every  15m, 09:00–23:30
pdl    5412.0
14:15  5448.0 · not hit
next   14:30`,
      raw: {
        cols: ['candle', 'open', 'high', 'low', 'close'],
        rows: [
          ['yesterday', '5,498', '5,530', '5,412', '5,470'],
          ['today 14:00', '5,452', '5,461', '5,440', '5,446'],
          ['today 14:15', '5,446', '5,455', '5,438', '5,448'],
        ],
        more: 'same 3 reads again at 14:30',
      },
      cap: '<b>3 candles per check.</b> Read here every 15 minutes, after this chat closes too. You only hear from it when it hits.',
    },
  };
  const ORDER = ['gap', 'ema', 'straddle', 'crude'];
  /* One box: each answer offers to keep watching. Same script, on a schedule. */
  const KEEP = {
    gap: ['Tell me the next time Nifty gaps down 1%', 'Checks at 9:16 every trading day.'],
    ema: ['Tell me when Silver Mini closes below this EMA', 'Checks every hour, 9:00 to 23:30.'],
    straddle: ['Tell me if Nifty moves past ±1.1% before expiry', 'Checks every 15 min until Tuesday.'],
    crude: [null, 'Keeps running after this chat closes.'],
  };

  /* ---------- Past date: answers as of a fixed past close, so no "sample" label is needed ----------
   TODO(Raunaq): these numbers are still the made-up ones. Replace every value below with a
   real /markets run for the close on Fri 21 Nov 2026 before this goes anywhere public.
   Only the fields listed here change; code, chart and everything else come from Q. */
  const PAST_DATE = 'Fri 21 Nov 2026';
  const PAST = {
    gap: {
      ans: '41 gap-downs from Jan 2023 to 21 Nov 2026. Nifty closed green on <b>17</b> of them (41%).',
      rows: [
        ['28 Oct 2026', 'Opened 1.3% below the prior close', '+0.4% ▲', 'u'],
        ['07 Aug 2026', 'Opened 1.1% below the prior close', '−0.9% ▼', 'd'],
        ['14 May 2026', 'Opened 1.8% below the prior close', '+1.1% ▲', 'u'],
      ],
      out: `gap_downs  41
green      17
pct_green  41.5%
median_ret -0.62%
2026-05-14    0.011
2026-08-07   -0.009
2026-10-28    0.004`,
    },
    ema: {
      ans: 'At the 21 Nov close, the 1-hour 20 EMA was <b>₹96,240</b>. Price closed ₹410 above it.',
      rows: [
        ['20 EMA (1h)', 'Exponential moving average, 20 periods', '₹96,240', 'n'],
        ['Close, 21 Nov', 'Up 0.4% on the day', '₹96,650', 'u'],
        ['Distance', 'Price above the EMA for 6 candles', '+0.43%', 'u'],
      ],
      out: `ema20 96240
last  96650
diff  410
above 6 candles`,
    },
    straddle: {
      ans: 'On 21 Nov, the ATM 26,000 straddle closed at <b>₹284</b>. That priced a move of about <b>±1.1%</b> by Tuesday’s expiry.',
      rows: [
        ['26000 CE', 'Call close, 21 Nov', '₹146', 'n'],
        ['26000 PE', 'Put close, 21 Nov', '₹138', 'n'],
        ['Range', '25,716 to 26,284 by expiry', '±284', 'n'],
      ],
      out: `atm      26000
ce, pe   146.0 138.0
straddle 284.0 (±1.09%)
range    25716.0 26284.0`,
    },
    crude: {
      ans: 'This watch fired on Tue 18 Nov at 14:30. Crude closed <b>₹5,398</b>, below Monday’s low of ₹5,412.',
      meta: 'CRUDEOIL · MCX · 15m · still running',
      rows: [
        ['18 Nov, 14:30', 'Closed ₹5,398, below the low. Hit.', 'sent', 'd'],
        ['Sent to', 'WhatsApp and email', '2 places', 'n'],
        ['Still watching', 'Same script, every 15 minutes', 'on', 'n'],
      ],
      out: `watch  below_pdl
fired  2026-11-18 14:30
close  5398.0 < pdl 5412.0
sent   whatsapp, email`,
    },
  };
  const W = {};
  const EYE = `<svg class="i" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>`;
  function keepHTML(d, key) {
    const k = KEEP[key],
      on = W[key] || d.mode === 'watch';
    return on
      ? `<div class="keep on"><button tabindex="-1">${EYE}Watching</button><span>${k[1]}</span></div>`
      : `<div class="keep"><button>${EYE}Keep watching</button><span>${k[0]}</span></div>`;
  }

  /* ---------- seeded random, so charts look the same every load ---------- */
  function rng(s) {
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /* ---------- candlestick chart ---------- */
  function chartSVG(c, W = 640, H = 270) {
    const r = rng(c.seed),
      bars = [];
    let p = c.base;
    for (let i = 0; i < c.n; i++) {
      let o = p;
      if (c.gaps && c.gaps.includes(i)) o = p * (1 - 0.011 - r() * 0.008);
      const ch =
        (r() - 0.5) * 2 * c.vol + (c.trend || 0) + (c.gaps && c.gaps.includes(i) ? (r() - 0.4) * c.vol : 0);
      const cl = o * (1 + ch),
        hi = Math.max(o, cl) * (1 + r() * c.vol * 0.6),
        lo = Math.min(o, cl) * (1 - r() * c.vol * 0.6);
      bars.push({ o, c: cl, h: hi, l: lo });
      p = cl;
    }
    let mn = Math.min(...bars.map((b) => b.l)),
      mx = Math.max(...bars.map((b) => b.h));
    if (c.pdl) {
      mn = Math.min(mn, c.pdl * 0.999);
    }
    if (c.band) {
      mn = Math.min(mn, c.band[0]);
      mx = Math.max(mx, c.band[1]);
    }
    const pad = (mx - mn) * 0.08;
    mn -= pad;
    mx += pad;
    const L = 8,
      R = 58,
      T = 10,
      B = 22,
      cw = (W - L - R) / c.n,
      y = (v) => T + ((mx - v) / (mx - mn)) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${c.title} candlestick chart">`;
    for (let k = 0; k <= 4; k++) {
      const v = mn + ((mx - mn) * k) / 4,
        yy = y(v);
      s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--line)" />`;
      s += `<text x="${W - R + 6}" y="${yy + 3}" font-size="9.5" fill="var(--axis)" font-family="ui-monospace,Menlo,monospace">${Math.round(v).toLocaleString('en-IN')}</text>`;
    }
    if (c.band) {
      const x0 = L + cw * (c.n - 10);
      s += `<rect x="${x0}" y="${y(c.band[1])}" width="${W - R - x0}" height="${y(c.band[0]) - y(c.band[1])}" fill="rgba(61,107,255,.13)" stroke="rgba(140,184,255,.4)" stroke-dasharray="3 3"/>`;
      s += `<text x="${x0 + 6}" y="${y(c.band[1]) + 13}" font-size="10" fill="var(--sky)" font-family="TS,system-ui">±1.1% by expiry</text>`;
    }
    if (c.pdl) {
      const yy = y(c.pdl);
      s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--peach)" stroke-dasharray="5 4"/>`;
      s += `<rect x="${W - R + 2}" y="${yy - 8}" width="54" height="16" rx="4" fill="var(--peach)"/><text x="${W - R + 6}" y="${yy + 3.5}" font-size="9.5" font-weight="600" fill="#0B0D10" font-family="ui-monospace,Menlo,monospace">${c.pdl.toLocaleString('en-IN')}</text>`;
      s += `<text x="${L + 4}" y="${yy - 6}" font-size="10" fill="var(--peach)" font-family="TS,system-ui">yesterday’s low</text>`;
    }
    bars.forEach((b, i) => {
      const x = L + cw * i + cw / 2,
        up = b.c >= b.o,
        col = up ? '#00A83C' : '#EF5350',
        bw = Math.max(2, cw * 0.62);
      s += `<line x1="${x}" x2="${x}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${col}" stroke-width="1"/>`;
      s += `<rect x="${x - bw / 2}" y="${y(Math.max(b.o, b.c))}" width="${bw}" height="${Math.max(1, Math.abs(y(b.o) - y(b.c)))}" fill="${col}" rx="1"/>`;
      if (c.gaps && c.gaps.includes(i)) {
        s += `<path d="M${x - 4} ${y(b.l) + 12} L${x + 4} ${y(b.l) + 12} L${x} ${y(b.l) + 6}Z" fill="${up ? 'var(--upt)' : 'var(--downt)'}"/>`;
      }
    });
    if (c.ema) {
      const k = 2 / (c.ema + 1);
      let e = bars[0].c,
        pts = [];
      bars.forEach((b, i) => {
        e = b.c * k + e * (1 - k);
        pts.push(`${L + cw * i + cw / 2},${y(e)}`);
      });
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--sky)" stroke-width="1.6"/>`;
    }
    const last = bars[bars.length - 1],
      ly = y(last.c),
      up = last.c >= last.o;
    s += `<rect x="${W - R + 2}" y="${ly - 8}" width="54" height="16" rx="4" fill="${up ? '#00A83C' : '#EF5350'}"/><text x="${W - R + 6}" y="${ly + 3.5}" font-size="9.5" font-weight="600" fill="#fff" font-family="ui-monospace,Menlo,monospace">${Math.round(last.c).toLocaleString('en-IN')}</text>`;
    return s + '</svg>';
  }

  /* ---------- render a question ---------- */
  let cur = 'gap',
    dataMode = 'del';
  let t1 = 'answer';
  const asOf = () => `As of ${PAST_DATE} close`;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /* tiny Python highlighter: strings, keywords, decorators, numbers, calls */
  function hl(src) {
    return esc(src).replace(
      /(f?"[^"\n]*")|\b(from|import|def|if|return)\b|(@\w+)|(\b\d+\.?\d*\b)|\b([A-Za-z_]\w*)(?=\()/g,
      (m, s, k, dc, n, f) =>
        s
          ? `<span class="st">${s}</span>`
          : k
            ? `<span class="kw">${k}</span>`
            : dc
              ? `<span class="kw">${dc}</span>`
              : n
                ? `<span class="nu">${n}</span>`
                : `<span class="fn">${f}</span>`,
    );
  }
  const nl = (s) => s.split('\n').length;
  /* ---------- the answer, then a chart that marks what the code counted ----------
   These notes match PAST, so update both when the real numbers go in. */
  const NOTE = {
    gap: '3 of the 41 gap-downs here, marked by how they closed',
    ema: 'blue: the same 20 EMA the code computed',
    straddle: 'shaded: ±₹284 around 26,000',
    crude: 'dashed: Monday’s low, checked every 15 min',
  };
  const card = (d) =>
    `<div class="ans"><p>${d.ans}</p><div class="meta"><span>${d.meta}</span><span>·</span><span>${asOf()}</span></div>${keepHTML(d, cur)}</div>`;
  const answerBlock = (d) =>
    card(d) +
    `<div class="mini"><div class="chart"><div class="ch"><b>${d.chart.title}</b><span>${NOTE[cur]}</span></div>${EW() < 820 ? chartSVG(d.chart, 400, 190) : chartSVG(d.chart, 640, 124)}</div></div>`; /* phones: a taller shape, so it isn't a thin strip */
  const codePre = (d) => `<pre class="code">${hl(d.code)}</pre>`;
  const soPre = (d) => `<pre class="so">${esc(d.out)}</pre>`;

  /* Exa's layout: Answer / Output / Code. Output is the raw stdout, like Exa's JSON tab. */
  const VIEW = {
    head: (d) =>
      `<div class="tabs" id="tabs">${[
        ['answer', 'Answer'],
        ['output', 'Output'],
        ['code', 'Code'],
      ]
        .map(([k, l]) => `<button data-t="${k}" class="${k === t1 ? 'on' : ''}">${l}</button>`)
        .join('')}</div><span class="ran">ran once · ${d.t}</span>`,
    body: (d) => `<div class="pane${t1 === 'answer' ? ' on' : ''}" data-p="answer">${answerBlock(d)}</div>
    <div class="pane${t1 === 'output' ? ' on' : ''}" data-p="output">${soPre(d)}<p class="codefoot">This is everything your agent got back.</p></div>
    <div class="pane${t1 === 'code' ? ' on' : ''}" data-p="code">${codePre(d)}<p class="codefoot">Your agent wrote this. It ran once on /markets, next to the data.</p></div>`,
    foot: (d) =>
      `<div class="foot2"><span>read here <b>${d.short} · ${d.size}</b></span><span class="to">sent to your agent <b>${nl(d.out)} lines · ${d.tok} tokens</b></span></div>`,
  };
  function render(key) {
    const d = { ...Q[key], ...PAST[key] };
    cur = key;
    /* the chip says how the agent read the question */
    const sc = $('#schip'),
      w = d.mode === 'watch';
    sc.classList.toggle('w', w);
    sc.innerHTML = w
      ? `${EYE}Watch`
      : `<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>Search markets`;
    $('#ohead').innerHTML = VIEW.head(d);
    $('#obody').innerHTML = VIEW.body(d);
    $('#ofoot').innerHTML = VIEW.foot(d);
    $$('#tabs button').forEach(
      (b) =>
        (b.onclick = () => {
          t1 = b.dataset.t;
          render(cur);
        }),
    );
    $$('.keep:not(.on) button').forEach(
      (b) =>
        (b.onclick = () => {
          W[cur] = 1;
          b.closest('.keep').outerHTML = keepHTML(d, cur);
          const pg = $('#pg');
          pg.classList.toggle('pulse', false);
          void pg.offsetWidth;
          pg.classList.add('pulse');
        }),
    );
    $$('.try').forEach((b) => b.classList.toggle('on', b.dataset.k === key));
  }
  function showCode() {
    t1 = 'code';
    render(cur);
  }
  let typing = 0;
  function ask(key) {
    const d = Q[key],
      inp = $('#q'),
      my = ++typing;
    if (RM) {
      inp.value = d.q;
      run(key);
      return;
    }
    inp.value = '';
    let i = 0;
    (function t() {
      if (my !== typing) return;
      inp.value = d.q.slice(0, ++i);
      if (i < d.q.length) setTimeout(t, 16 + Math.random() * 22);
      else setTimeout(() => run(key), 250);
    })();
  }
  function run(key) {
    const p = $('#panes');
    $('#runline').textContent =
      Q[key].mode === 'watch' ? 'Setting up the watch next to the data…' : 'Running next to the data…';
    p.classList.add('busy');
    DEPTH.fx('start', key);
    setTimeout(
      () => {
        render(key);
        p.classList.toggle('busy', false);
        DEPTH.fx('done', key);
        AUTO.ran();
      },
      RM ? 0 : 850,
    );
  }

  /* ---------- wiring ---------- */
  $('#tries').innerHTML = ORDER.map((k) => `<button class="try" data-k="${k}">${Q[k].chip}</button>`).join(
    '',
  );
  $$('.try').forEach(
    (b) =>
      (b.onclick = () => {
        AUTO.stop();
        ask(b.dataset.k);
      }),
  );
  $('#clr').onclick = () => {
    typing++;
    $('#q').value = '';
    $('#q').focus();
  };
  function submit() {
    const v = $('#q').value.trim().toLowerCase();
    if (!v) return;
    const k =
      ORDER.find((k) => Q[k].q.toLowerCase() === v) ||
      (/crude|watch|alert|ping|tell me/.test(v)
        ? 'crude'
        : /straddle|option|chain/.test(v)
          ? 'straddle'
          : /ema|silver|average/.test(v)
            ? 'ema'
            : 'gap');
    t1 = 'answer';
    run(k);
  }
  $('#go').onclick = submit;
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  $$('#data .opt').forEach(
    (b) =>
      (b.onclick = () => {
        dataMode = b.dataset.d;
        $$('#data .opt').forEach((x) => x.classList.toggle('on', x === b));
        const brk = dataMode === 'brk',
          h = $('#hold');
        h.disabled = !brk;
        h.title = brk ? 'Your Kite holdings, read-only' : 'Log in with Kite';
        if (!brk) h.classList.toggle('on', false);
        $('#dnote').innerHTML = brk
          ? '<b>Real-time, through your Zerodha account.</b> Plus your holdings, read-only.'
          : 'Free. NSE and MCX, 15 minutes behind.';
        render(cur);
      }),
  );
  $$('#mkts .opt').forEach(
    (b) =>
      (b.onclick = () => {
        if (!b.disabled) b.classList.toggle('on');
      }),
  );
  $('.set .foot .sq').onclick = showCode;
  /* R runs the current question again */
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
    if (e.key === 'r' || e.key === 'R') {
      AUTO.stop();
      ask(cur);
    }
  });

  /* ---------- Exa's fit rule: headline about 1.08x the playground width, one line ---------- */
  function fitH1() {
    const h = $('#h1');
    h.style.fontSize = '';
    if (EW() <= 820) return;
    const target = Math.min($('#pg').offsetWidth * 1.08, EW() - 48),
      w = h.scrollWidth;
    h.style.fontSize = Math.max(44, Math.min(76, (63.2 * target) / w)) + 'px';
  }
  addEventListener('resize', fitH1);
  whenFontsReady(fitH1);
  fitH1();

  /* =====================================================================
   Depth: a Nifty futures order book. All numbers made up.
   ===================================================================== */
  const fmt = (n) => Math.round(n).toLocaleString('en-IN');
  const DEPTH = (() => {
    /* Desktop: full-width book, hero in the valley.
     Phone: a short band where the "Connect your AI" button sits in the spread.
     On each run: a blue wave leaves the playground, then a receipt shows what was
     read on /markets and what went to the agent. */
    const cv = $('#depth'),
      ctx = cv.getContext('2d'),
      N = 80,
      STEP = 0.5,
      BAND = 130;
    let W,
      H,
      mid = 25999.75,
      bq = [],
      aq = [],
      bt = [],
      at = [],
      ready = false,
      mob = false;
    const ev = { start: -1e9, done: -1e9, key: 'gap', busy: false };
    const RECEIPT = {
      gap: ['961 daily candles · 2.1 MB', '7 lines · 52 tokens', '961 candles', '52 tokens'],
      ema: ['196 hourly candles · 0.4 MB', '4 lines · 26 tokens', '196 candles', '26 tokens'],
      straddle: ['182 strikes, the full chain', '4 lines · 38 tokens', '182 strikes', '38 tokens'],
      crude: ['15-min candles, every check', '1 message when it hits', 'every 15 min', '1 alert'],
    };
    const now = () => performance.now(),
      clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
      ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
    // A still book has stable levels across renders in reduced-motion mode.
    let seed = 42;
    const random = RM ? () => (seed = (seed * 16807) % 2147483647) / 2147483647 : Math.random;
    const q0 = (i) => (400 + random() * 900) * (1 + i / 40) * (random() < 0.06 ? 4 : 1);
    for (let i = 0; i < N; i++) {
      bq[i] = bt[i] = q0(i);
      aq[i] = at[i] = q0(i);
    }
    function place() {
      mob = document.documentElement.classList.contains('lt1100');
      if (!mob) {
        cv.style.top = cv.style.height = cv.style.bottom = '';
        return;
      }
      const hr = $('.hero').getBoundingClientRect(),
        br = $('.cta .btn').getBoundingClientRect();
      cv.style.top = br.bottom - hr.top + 2 - BAND + 'px';
      cv.style.height = BAND + 'px';
      cv.style.bottom = 'auto';
    }
    function size() {
      place();
      const d = devicePixelRatio || 1;
      W = cv.clientWidth;
      H = cv.clientHeight;
      if (!W) return;
      cv.width = W * d;
      cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ready = true;
    }
    /* a bright band moving outward: f = front position 0..1, d = level position 0..1 */
    const band = (d, f, w = 0.1) =>
      f < 0 || f > 1.4 ? 0 : Math.exp(-(((d - f) / w) ** 2)) * (1 - clamp(f) * 0.3);
    function side(q, dir, col, fill) {
      const t = now(),
        n = mob ? 28 : N,
        cx = W / 2,
        gap = mob ? $('.cta .btn').offsetWidth / 2 + 12 : 24,
        sx = (cx - gap) / n,
        base = mob ? H - 2 : H - 26,
        tall = mob ? 0.82 : 0.78;
      const hole = mob ? gap : Math.min(cx - 60, 430),
        xs = (i) => cx + dir * (gap + i * sx),
        dOf = (i) => clamp((Math.abs(xs(i) - cx) - hole) / Math.max(1, cx - hole));
      const fw = (t - ev.start) / 1100; /* wave front after a run starts */
      const raw = [];
      q.slice(0, n).reduce((s, v, i) => (raw[i] = s + v), 0);
      const max = Math.max(raw[n - 1], 1);
      const gl = [];
      for (let i = 0; i < n; i++) gl.push(band(dOf(i), fw));
      const cum = raw,
        Y = (i) => base - (cum[i] / max) * (H * tall);
      const g = ctx.createLinearGradient(0, base - H * tall, 0, base);
      g.addColorStop(0, fill);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.moveTo(cx + dir * gap, base);
      let y = base;
      for (let i = 0; i < n; i++) {
        const x = xs(i);
        ctx.lineTo(x, y);
        y = Y(i);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(xs(n), y);
      ctx.lineTo(xs(n), base);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      /* glow: light passing through the book */
      ctx.save();
      ctx.shadowColor = 'rgba(140,184,255,.9)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const e = gl[i];
        if (e < 0.03) continue;
        const x0 = xs(i),
          x1 = xs(i + 1),
          yy = Y(i),
          yp = i ? Y(i - 1) : base;
        ctx.fillStyle = `rgba(61,107,255,${e * 0.22})`;
        ctx.fillRect(Math.min(x0, x1), yy, Math.abs(x1 - x0), base - yy);
        ctx.strokeStyle = `rgba(170,205,255,${e})`;
        ctx.beginPath();
        ctx.moveTo(x0, yp);
        ctx.lineTo(x0, yy);
        ctx.lineTo(x1, yy);
        ctx.stroke();
      }
      ctx.restore();
      ctx.font = '10.5px ui-monospace,Menlo,monospace';
      /* Receipt: what stayed here vs what went to the agent */
      const r = RECEIPT[ev.key],
        ra = Math.min(clamp((t - ev.done - 150) / 300), clamp((4800 - (t - ev.done)) / 600));
      if (mob) {
        ctx.textAlign = dir < 0 ? 'left' : 'right';
        if (ra > 0) {
          ctx.fillStyle = `rgba(170,205,255,${ra})`;
          ctx.fillText(dir < 0 ? `read ${r[2]}` : `sent ${r[3]}`, dir < 0 ? 4 : W - 4, 10);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.42)';
          ctx.fillText(
            `${dir < 0 ? 'BIDS' : 'ASKS'} ${(raw[n - 1] / 1e5).toFixed(2)}L`,
            dir < 0 ? 4 : W - 4,
            10,
          );
        }
        return raw[n - 1];
      }
      /* biggest wall gets a label (hidden while a receipt shows) */
      if (ra > 0) return raw[n - 1];
      const vis = (i) => Math.abs(gap + i * sx) > Math.min(cx - 60, 500);
      let w = -1;
      q.forEach((v, i) => {
        if (vis(i) && (w < 0 || v > q[w])) w = i;
      });
      if (w < 0) w = N - 1;
      const wx = xs(w),
        wy = Y(w),
        px = mid + dir * (STEP / 2 + w * STEP);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(wx, wy, 2.5, 0, 7);
      ctx.fill();
      const lab = `wall ${fmt(px)} · ${(q[w] / 1000).toFixed(1)}k`;
      ctx.textAlign = 'center';
      const tw = ctx.measureText(lab).width + 12;
      const lx = Math.min(W - tw / 2 - 4, Math.max(tw / 2 + 4, wx));
      ctx.fillStyle = 'rgba(15,17,20,.92)';
      ctx.fillRect(lx - tw / 2, wy - 26, tw, 17);
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText(lab, lx, wy - 13);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.textAlign = 'center';
      for (let i = 10; i < N; i += 20)
        ctx.fillText(fmt(mid + dir * (STEP / 2 + i * STEP)), cx + dir * (gap + i * sx), H - 8);
      return raw[n - 1];
    }
    function draw() {
      if (!ready) return;
      ctx.clearRect(0, 0, W, H);
      if (!mob) {
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        ctx.lineWidth = 1;
        for (let k = 1; k < 5; k++) {
          const y = H - 26 - (k * (H * 0.78)) / 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
      }
      const b = side(bq, -1, 'rgba(63,207,114,.75)', 'rgba(0,168,60,.22)'),
        a = side(aq, 1, 'rgba(255,122,119,.75)', 'rgba(239,83,80,.2)');
      $('#bidbrk').textContent = `[ NIFTY FUT · BIDS ${(b / 1e5).toFixed(2)}L ]`;
      $('#askbrk').textContent =
        `[ ASKS ${(a / 1e5).toFixed(2)}L · ${PAST_DATE.slice(4).toUpperCase()} CLOSE ]`;
    }
    let t = 0;
    function tick() {
      if (mob && ++t % 10 === 0) size(); /* keep the band on the button if the layout moves */
      for (let k = 0; k < 8; k++) {
        const i = (Math.random() * N) | 0;
        bt[i] = q0(i);
        const j = (Math.random() * N) | 0;
        at[j] = q0(j);
      }
      for (let i = 0; i < N; i++) {
        bq[i] += (bt[i] - bq[i]) * 0.12;
        aq[i] += (at[i] - aq[i]) * 0.12;
      }
      if (Math.random() < 0.03) {
        const up = Math.random() < 0.5;
        mid += up ? STEP : -STEP;
        if (up) {
          bq.unshift(aq.shift());
          bt.unshift(at.shift());
          bq.pop();
          bt.pop();
          aq.push(q0(N));
          at.push(aq[N - 1]);
        } else {
          aq.unshift(bq.shift());
          at.unshift(bt.shift());
          aq.pop();
          at.pop();
          bq.push(q0(N));
          bt.push(bq[N - 1]);
        }
      }
      if (RM) draw();
    }
    function loop() {
      draw();
      requestAnimationFrame(loop);
    }
    let rt = 0;
    function fx(type, key) {
      if (RM) return;
      ev.key = key;
      ev[type] = now();
      ev.busy = type === 'start';
      const rl = $('#rl'),
        rr = $('#rr');
      clearTimeout(rt);
      rl.classList.remove('on');
      rr.classList.remove('on');
      if (type === 'done') {
        const r = RECEIPT[key];
        rl.innerHTML = `<small>Read on /markets</small>${r[0]}`;
        rr.innerHTML = `<small>Sent to your agent</small>${r[1]}`;
        setTimeout(() => {
          rl.classList.add('on');
          rr.classList.add('on');
        }, 150);
        rt = setTimeout(() => {
          rl.classList.remove('on');
          rr.classList.remove('on');
        }, 5000);
      }
      if (type === 'start') {
        const pg = $('#pg');
        pg.classList.remove('pulse');
        void pg.offsetWidth;
        pg.classList.add('pulse');
      }
    }
    whenFontsReady(() => {
      size();
      draw();
    });
    return {
      init() {
        size();
        draw();
        if (!RM) requestAnimationFrame(loop);
      },
      resize() {
        size();
        draw();
      },
      tick,
      ms: 90,
      fx,
    };
  })();
  DEPTH.init();
  if (!RM)
    setInterval(() => {
      if (!document.hidden) DEPTH.tick();
    }, DEPTH.ms);
  addEventListener('resize', DEPTH.resize);

  /* =====================================================================
   Demo loop: type an example, run it (pulse + receipt), show the answer
   with its chart, erase, pause on an empty box, next example.
   Any click, focus or "/" in the playground hands it to the visitor.
   Hovering pauses the countdown. Reduced motion: no loop.
   ===================================================================== */
  const AUTO = (() => {
    const HOLD = 7000,
      GAP = 1400,
      PH = $('#q').placeholder,
      PH_TURN = 'Your turn: type any question';
    const inp = $('#q'),
      prog = $('#prog'),
      hint = $('#hint'),
      pg = $('#pg');
    const touch = matchMedia('(pointer:coarse)').matches;
    let on = false,
      i = 0,
      held = 0,
      phase = 'idle',
      paused = false,
      vis = true;
    function setHint(s) {
      hint.innerHTML =
        s === 'demo'
          ? touch
            ? 'Tap to type your own'
            : '<kbd>/</kbd> type your own'
          : s === 'focus'
            ? '<kbd>↵</kbd> to run'
            : touch
              ? ''
              : '<kbd>/</kbd> to ask';
    }
    function next() {
      if (!on) return;
      phase = 'type';
      held = 0;
      t1 = 'answer';
      ask(ORDER[i++ % ORDER.length]);
    }
    function erase() {
      phase = 'erase';
      const my = ++typing;
      (function e() {
        if (!on || my !== typing) return;
        inp.value = inp.value.slice(0, -2);
        if (inp.value) return setTimeout(e, 10);
        phase = 'gap';
        inp.placeholder = PH_TURN;
        hint.classList.add('lit');
        setTimeout(() => {
          if (!on || my !== typing) return;
          inp.placeholder = PH;
          hint.classList.remove('lit');
          next();
        }, GAP);
      })();
    }
    setInterval(() => {
      if (!on) return;
      if (phase === 'hold' && !paused && vis && !document.hidden) {
        held += 50;
        if (held >= HOLD) erase();
      }
      prog.style.transform = `scaleX(${phase === 'hold' ? Math.min(1, held / HOLD) : phase === 'type' ? 0 : 1})`;
    }, 50);
    function start() {
      if (RM) return;
      on = true;
      setHint('demo');
      prog.classList.add('on');
      next();
    }
    function stop() {
      if (!on) return;
      on = false;
      typing++;
      phase = 'idle';
      prog.classList.remove('on');
      inp.placeholder = PH;
      hint.classList.remove('lit');
      setHint(document.activeElement === inp ? 'focus' : 'idle');
    }
    function take() {
      stop();
      inp.focus();
      inp.select();
    }
    /* capture, so a click on a tab or Keep watching stops the loop before it acts */
    pg.addEventListener('click', stop, true);
    pg.addEventListener('focusin', stop);
    pg.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') paused = true;
    });
    pg.addEventListener('pointerleave', () => (paused = false));
    hint.onclick = take;
    inp.addEventListener('focus', () => {
      inp.select();
      setHint('focus');
    });
    inp.addEventListener('blur', () => setHint(on ? 'demo' : 'idle'));
    addEventListener('keydown', (e) => {
      if (
        e.key === '/' &&
        document.activeElement !== inp &&
        !/INPUT|TEXTAREA/.test(document.activeElement.tagName)
      ) {
        e.preventDefault();
        take();
      }
    });
    observeIntersection((es) => (vis = es[0].isIntersecting)).observe(pg);
    setHint(RM ? 'idle' : 'demo');
    return {
      start,
      stop,
      ran() {
        if (on) {
          phase = 'hold';
          held = 0;
        }
      },
    };
  })();

  render('gap');
  if (RM) ask('gap');
  else setTimeout(AUTO.start, 600);

  return {
    $,
    RM,
    Q,
    ORDER,
    AUTO,
    hl,
    getSubmit: () => submit,
    setSubmit: (fn) => {
      submit = fn;
    },
  };
}
