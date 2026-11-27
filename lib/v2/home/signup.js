/* Shared sheet controller. Only the lab uses demo authentication. */
/** @param {ReturnType<typeof import('./auth').homepageAuth> | null} auth */
export function mountSignup(root, scope, hero, UX, initialState, auth = null) {
  const { $, RM, Q, ORDER, AUTO } = hero;
  const { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener } = scope;
  const FIRST_CODE = 417302,
    CODE_LIFETIME = 600000,
    RESEND_DELAY = 30000;
  const EXISTING_EMAIL = 'returning@example.com',
    SIGNUP_KEY = auth ? 'slash-home:signup-attempt' : 'slash-home-lab:signup-attempt';
  const CODE_STEPS = ['code', 'wrong', 'returning', 'expired', 'resent', 'resume'];
  const OWN = 'Show every day RELIANCE closed above its 20-day high this year';
  let mode = 'email',
    pendingQ = '',
    email = '',
    step = 'email',
    timer = null,
    responseTimer = null,
    attempt = null,
    keepAttempt = false;
  let requestVersion = 0;
  let busy = false;
  let requestError = '';
  const navr = $('#navr'),
    cta = $('#cta'),
    back = $('#back'),
    ov = $('#ov'),
    sh = $('#sheet');
  const X = '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function toast(m, ms = 2600) {
    const t = $('#toast2');
    t.textContent = m;
    t.style.display = 'block';
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.style.display = 'none'), ms);
  }
  function escH(s) {
    return String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  }

  /* ---------- page per state ---------- */
  function paint() {
    if (mode === 'in') {
      if (auth) {
        navr.innerHTML = '<a class="btn" href="/chat" data-act="chat">Open chat</a>';
        cta.innerHTML = '<a class="btn" href="/chat" data-act="chat">Open chat</a>';
        back.classList.remove('on');
        back.innerHTML = '';
        return;
      }
      navr.innerHTML = `<a class="btn" href="#" data-act="chat">Open chat</a><span class="avw" style="--k:62%" title=""><b>A</b><span class="tip">Kite <b>connected</b> · until 06:00 · 14h 32m</span></span>`;
      cta.innerHTML = `<a class="btn" href="#" data-act="chat">Open chat</a>`;
      back.classList.add('on');
      back.innerHTML = `<a href="#" data-act="chat"><small>Continue</small><span>Where is NIFTY headed this week?</span><em>2h ago · 3 runs</em></a>
      <a href="#" data-act="watchers"><small>Watching</small><span><i class="dot"></i>2 watchers</span><em>GOLDBEES below ₹100 · checked 1m ago</em></a>`;
    } else {
      const w = mode === 'wait',
        label = w ? 'Join waitlist' : 'Sign up';
      navr.innerHTML = `<a class="ghost" href="#" data-act="signin">Sign in</a><a class="btn" href="#" data-act="signup">${label}</a>`;
      cta.innerHTML = `<a class="btn" href="#" data-act="signup">${w ? 'Join waitlist' : 'Sign up free'}</a>`;
      back.classList.remove('on');
      back.innerHTML = '';
    }
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    e.preventDefault();
    const act = a.dataset.act;
    if (act === 'signup') {
      pendingQ = '';
      open('email');
    } else if (act === 'signin') {
      pendingQ = '';
      open('email', true);
    } else if (act === 'chat') UX.exit('ask', 'empty');
    else if (act === 'watchers') UX.exit('watchers', 'active');
    else if (act === 'ai') toast('→ Connect your AI: the MCP connector page. Unchanged.');
  });

  /* ---------- typed question: samples still run, your own question gates ---------- */
  const sampleRun = hero.getSubmit();
  const submit = function () {
    const v = $('#q').value.trim();
    if (!v) return;
    const isSample = ORDER.some((k) => Q[k].q.toLowerCase() === v.toLowerCase());
    if (isSample) return sampleRun();
    if (mode === 'in') {
      if (auth) {
        UX.queuedQuestion(v);
        UX.exit('ask', 'draft');
        return;
      }
      toast('→ chat, running: “' + v.slice(0, 60) + (v.length > 60 ? '…' : '') + '”');
      return;
    }
    pendingQ = v;
    open('email');
  };
  hero.setSubmit(submit);
  $('#go').onclick = submit;

  /* ---------- the sheet (v2: glass over the book, a ticking quote, receipts as it runs) ---------- */
  const TICK = {
    RELIANCE: ['NSE', 1412.35],
    BANKNIFTY: ['NSE', 58210.15],
    NIFTY: ['NSE', 25768.4],
    HDFCBANK: ['NSE', 1986.2],
    INFY: ['NSE', 1588.75],
    TCS: ['NSE', 3120.1],
    CRUDE: ['MCX', 5412],
    GOLD: ['MCX', 126450],
    SILVER: ['MCX', 151230],
  };
  let tk = null,
    tkT = null,
    rT = null;
  function clock(d = new Date()) {
    return d.toTimeString().slice(0, 8);
  }
  function mask(e) {
    const [u, d] = e.split('@');
    return (u[0] || '') + '•••@' + (d || '');
  }
  function pickSym(q) {
    const m = q.toUpperCase().match(/BANKNIFTY|RELIANCE|NIFTY|HDFCBANK|INFY|TCS|CRUDE|GOLD|SILVER/);
    return m ? m[0] : 'NIFTY';
  }
  function startTick() {
    clearInterval(tkT);
    const el = sh.querySelector('.tick');
    if (!el) return;
    const sym = el.dataset.s,
      [ex, base] = TICK[sym];
    if (!tk || tk.sym !== sym) tk = { sym, prev: base * (1 - 0.0031), px: base };
    const dp = base > 10000 ? 2 : 2;
    const draw = () => {
      const ch = (tk.px / tk.prev - 1) * 100,
        up = ch >= 0;
      el.innerHTML = `<span>${sym} · ${ex}</span><b class="flash">${tk.px.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}</b><span class="ch ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'}${Math.abs(ch).toFixed(2)}%</span><span class="dl">${auth ? 'Sample quote' : '15m delayed'} · ${clock()}</span>`;
    };
    draw();
    if (RM) return;
    tkT = setInterval(() => {
      tk.px *= 1 + (Math.random() - 0.48) * 0.0006;
      draw();
    }, 1300);
  }
  function receipts(l, r, ok) {
    const a = $('#srl'),
      b = $('#srr');
    clearTimeout(rT);
    a.classList.remove('on');
    b.classList.remove('on');
    if (!l) return;
    a.classList.toggle('ok', !!ok);
    b.classList.toggle('ok', !!ok);
    a.innerHTML = l;
    b.innerHTML = r;
    setTimeout(() => {
      a.classList.add('on');
      b.classList.add('on');
    }, 120);
    rT = setTimeout(() => {
      a.classList.remove('on');
      b.classList.remove('on');
    }, 5200);
  }
  function pulse(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }
  function state(s) {
    step = s;
    if (UX.flow === 'signup') UX.state(s);
  }
  function open(s, signin) {
    requestError = '';
    UX.event('sheet-open');
    state(s);
    ov.classList.add('on');
    document.body.classList.add('sheeting');
    AUTO.stop();
    renderSheet(signin);
  }
  function close() {
    requestVersion++;
    busy = false;
    ov.classList.remove('on');
    document.body.classList.remove('sheeting');
    clearTimeout(responseTimer);
    clearInterval(timer);
    clearInterval(tkT);
    receipts();
  }
  function storeAttempt(value) {
    try {
      if (value) sessionStorage.setItem(SIGNUP_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SIGNUP_KEY);
    } catch {}
  }
  function dismiss() {
    if (keepAttempt) storeAttempt(null);
    if (auth && step === 'done') {
      mode = 'in';
      paint();
    }
    close();
  }
  function resumeAttempt() {
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem(SIGNUP_KEY));
    } catch {}
    if (typeof saved?.email !== 'string' || !Number.isFinite(saved.sentAt)) return false;
    ({ email, pendingQ } = saved);
    attempt = saved;
    if (!auth) demoCode = saved.code;
    keepAttempt = true;
    open(Date.now() - saved.sentAt >= CODE_LIFETIME ? 'expired' : 'resume', saved.signin);
    return true;
  }
  ov.addEventListener('click', (e) => {
    if (e.target === ov) dismiss();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ov.classList.contains('on')) dismiss();
  });

  let demoCode = FIRST_CODE;
  function startCode(signin, resend = false) {
    attempt = { email, pendingQ, signin, sentAt: Date.now() };
    if (!auth) attempt.code = resend ? demoCode + 1 : FIRST_CODE;
    demoCode = attempt.code;
    if (keepAttempt) storeAttempt(attempt);
    receipts(
      `<small>Code sent</small>6 digits → ${escH(mask(email))} · ${clock()}`,
      resend
        ? '<small>New code</small>Use the latest email'
        : `<small>${pendingQ ? 'Queued' : 'Next'}</small>${pendingQ ? 'your question · runs after sign-in' : 'enter the code'}`,
    );
    state(resend ? 'resent' : 'code');
    renderSheet(signin);
  }
  async function sendLive(signin, resend = false) {
    if (busy) return;
    busy = true;
    requestError = '';
    const previous = step;
    const version = ++requestVersion;
    if (!resend) state('sending');
    renderSheet(signin);
    const result = await auth.send(email);
    if (version !== requestVersion) return;
    busy = false;
    if (result.ok) {
      startCode(signin, resend);
    } else {
      requestError = result.error;
      state(resend ? previous : 'send-failed');
      renderSheet(signin);
    }
  }
  function qcard(state) {
    if (!pendingQ) return '';
    return `<div class="qcard"><div class="qh"><i class="dot"></i>Your question<span class="st">${state}</span></div><span>${escH(pendingQ)}</span>
    <div class="tick" data-s="${pickSym(pendingQ)}"></div></div>`;
  }
  function track(signin, w, at) {
    const steps = signin
      ? ['Email', 'Code', 'Chat']
      : w
        ? ['Email', 'Your spot', 'Your answer']
        : ['Email', 'Code', 'Your answer'];
    return `<div class="track">${steps.map((s, i) => `<span class="${i < at ? 'ok' : i === at ? 'now' : ''}">${i < at ? '✓' : '0' + (i + 1)} ${s}</span>`).join('<i>→</i>')}</div>`;
  }
  function top(signin, w, at, title) {
    return `<div class="sh-top"><button class="x" aria-label="Close">${X}</button>${track(signin, w, at)}<h2>${title}</h2><i class="prog2" style="transform:scaleX(${[0.08, 0.5, 1][at] || 1})"></i></div>`;
  }
  function renderSheet(signin) {
    const w = mode === 'wait' && !signin;
    if (['email', 'invalid-email', 'sending', 'send-failed'].includes(step)) {
      const sending = step === 'sending',
        invalid = step === 'invalid-email',
        failed = step === 'send-failed';
      const title = signin
        ? 'Welcome back'
        : pendingQ
          ? 'Run this on real data'
          : w
            ? 'Join the waitlist'
            : 'Make an account';
      const sub = signin
        ? "We'll email you a code. No password."
        : w
          ? "We're opening to a small group of traders first. Leave your email and we'll send a code when your spot opens."
          : "Free. Takes a minute. We'll email you a code, no password.";
      sh.innerHTML =
        top(signin, w, 0, title) +
        `<div class="sh-bd">${qcard('queued')}<p>${sub}</p>
      <input class="fld" id="em" type="email" aria-label="Email address" placeholder="you@example.com" autocomplete="email" value="${escH(email)}"${sending ? ' readonly' : ''}${invalid ? ' aria-invalid="true" aria-describedby="email-error"' : ''}>
      <div id="email-error" class="sheet-error" role="alert"${invalid ? '' : ' hidden'}>Enter an email address like you@example.com.</div>
      ${failed ? `<div class="sheet-error" role="alert">${escH(requestError || 'We couldn’t send a code. Try again with the same email.')}</div>` : ''}
      <button class="btn" id="send"${sending ? ' aria-busy="true"' : ''}>${w ? 'Join waitlist' : sending ? '<i class="sheet-spinner" aria-hidden="true"></i>Sending code…' : failed ? 'Try again' : 'Send code'}</button>
      <p class="fineprint">Read-only. It never places orders.<br>By continuing you agree to the <a href="${auth ? '/terms' : '#'}">Terms</a> and <a href="${auth ? '/privacy' : '#'}">Privacy Policy</a>.</p></div>`;
      const em = $('#em'),
        send = $('#send'),
        err = $('#email-error');
      const editable = () => {
        send.disabled = sending || !em.value.trim();
      };
      editable();
      em.oninput = () => {
        editable();
        err.hidden = true;
        em.removeAttribute('aria-invalid');
        em.removeAttribute('aria-describedby');
        if (step === 'invalid-email') state('email');
      };
      em.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.isComposing) send.click();
      };
      send.onclick = () => {
        email = em.value.trim();
        if (!em.validity.valid || !email.split('@').at(-1).includes('.')) {
          state('invalid-email');
          err.hidden = false;
          em.setAttribute('aria-invalid', 'true');
          em.setAttribute('aria-describedby', 'email-error');
          em.focus();
          return;
        }
        pulse(sh);
        if (w) {
          receipts(
            `<small>On the list</small>${escH(mask(email))} · ${clock()}`,
            `<small>${pendingQ ? 'Saved' : 'Next'}</small>${pendingQ ? 'your question · runs first' : 'a code when your spot opens'}`,
          );
          state('listed');
          renderSheet(signin);
          return;
        }
        keepAttempt = true;
        if (auth) {
          void sendLive(signin);
          return;
        }
        state('sending');
        renderSheet(signin);
        responseTimer = setTimeout(() => {
          if (!navigator.onLine) {
            state('send-failed');
            renderSheet(signin);
            return;
          }
          startCode(signin);
        }, 500);
      };
      if (!sending) setTimeout(() => em.focus(), 60);
    } else if (CODE_STEPS.includes(step)) {
      const expired = step === 'expired',
        sent = new Date(attempt.sentAt);
      const hint =
        step === 'resent'
          ? 'A new code was sent. Use the latest email.'
          : step === 'resume'
            ? 'Continue with the code already sent to your email.'
            : '';
      sh.innerHTML =
        top(signin, false, 1, expired ? 'Code expired' : signin ? 'Welcome back' : 'Check your inbox') +
        `<div class="sh-bd">
      <div class="mailline"><i></i>code sent to ${escH(email)} · ${clock(sent)}<span id="exp"></span></div>${step === 'returning' ? '<p class="rt2">This email already has an account. The code signs you in.</p>' : ''}${qcard('queued')}${inbox2()}
      ${hint ? `<p class="sheet-status" role="status">${hint}</p>` : ''}
      ${requestError ? `<p class="sheet-error" role="alert">${escH(requestError)}</p>` : ''}
      <div class="codes${step === 'wrong' ? ' bad' : ''}" id="codes">${`<input inputmode="numeric" maxlength="1" aria-label="digit"${expired ? ' disabled' : ''}>`.repeat(6)}</div>
      <div class="err" role="alert">That code didn’t match. Check the newest email, or resend.</div>
      ${expired ? '<div class="sheet-error" role="alert">That code has expired. Send a new one to continue.</div><button class="btn" id="rs">Send a new code</button>' : '<button class="btn" id="vin" disabled>Sign in</button>'}
      <div class="links2">${expired ? '' : '<button id="rs" disabled>resend in 0:30</button>'}<button id="diff">use a different email</button></div></div>`;
      const rs = $('#rs');
      rs.disabled ||= busy;
      if (busy) rs.setAttribute('aria-busy', 'true');
      rs.onclick = () => (auth ? void sendLive(signin, true) : startCode(signin, true));
      $('#diff').onclick = () => {
        requestVersion++;
        busy = false;
        requestError = '';
        clearInterval(timer);
        if (keepAttempt) storeAttempt(null);
        state('email');
        renderSheet(signin);
      };
      clearInterval(timer);
      if (expired) $('#exp').textContent = 'expired';
      else {
        const ins = [...sh.querySelectorAll('.codes input')],
          vin = $('#vin'),
          codes = $('#codes'),
          ex = $('#exp');
        const codeState = step === 'wrong' ? 'code' : step;
        const val = () => ins.map((i) => i.value).join('');
        function updateInputs() {
          if (step === 'wrong') state(codeState);
          codes.classList.remove('bad');
          vin.disabled = busy || val().length < 6;
          if (!vin.disabled) vin.click();
        }
        ins.forEach((inp, i) => {
          inp.oninput = () => {
            inp.value = inp.value.replace(/\D/g, '').slice(-1);
            if (inp.value && ins[i + 1]) ins[i + 1].focus();
            updateInputs();
          };
          inp.onkeydown = (e) => {
            if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus();
          };
          inp.onpaste = (e) => {
            const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
            if (!digits) return;
            e.preventDefault();
            ins.forEach((box, j) => {
              box.value = digits[j] || '';
            });
            ins[digits.length]?.focus();
            updateInputs();
          };
        });
        vin.onclick = async () => {
          const code = val();
          if (busy || code.length !== 6 || !updateClock()) return;
          if (auth) {
            busy = true;
            vin.disabled = true;
            rs.disabled = true;
            ins.forEach((input) => {
              input.disabled = true;
            });
            const version = ++requestVersion;
            const result = await auth.verify(email, code);
            if (version !== requestVersion) return;
            busy = false;
            if (!result.ok) {
              requestError = result.status === 401 ? '' : result.error;
              state(result.status === 401 ? 'wrong' : 'code');
              renderSheet(signin);
              return;
            }
            auth.saveSession(result);
            storeAttempt(null);
            state('done');
            renderSheet(true);
            return;
          }
          if (code !== String(attempt.code)) {
            state('wrong');
            codes.classList.add('bad');
            ins.forEach((i) => (i.value = ''));
            ins[0].focus();
            vin.disabled = true;
            return;
          }
          if (keepAttempt) storeAttempt(null);
          const existing = !signin && email.toLowerCase() === EXISTING_EMAIL;
          state(
            (signin || existing) && pendingQ ? 'returning-question' : existing ? 'existing-account' : 'done',
          );
          renderSheet(signin || existing);
        };
        function updateClock() {
          const age = Date.now() - attempt.sentAt,
            remaining = Math.ceil((CODE_LIFETIME - age) / 1000);
          if (remaining <= 0 && !busy) {
            state('expired');
            renderSheet(signin);
            return false;
          }
          const left = Math.max(0, Math.ceil((RESEND_DELAY - age) / 1000));
          ex.textContent =
            'expires ' +
            Math.floor(Math.max(0, remaining) / 60) +
            ':' +
            String(Math.max(0, remaining) % 60).padStart(2, '0');
          rs.disabled = busy || left > 0;
          rs.textContent = left ? 'resend in 0:' + String(left).padStart(2, '0') : 'resend code';
          return true;
        }
        if (updateClock()) {
          timer = setInterval(updateClock, 1000);
          setTimeout(() => ins[0].focus(), 60);
        }
      }
    } else if (['done', 'existing-account', 'returning-question'].includes(step)) {
      clearInterval(timer);
      sh.innerHTML =
        top(signin, false, 2, "You're in") +
        `<div class="sh-bd">
      <div class="okline">● signed in as ${escH(email)} · ${clock()}</div>${qcard('opens in chat')}
      <p>${signin ? (pendingQ ? 'Your question is ready in chat. You can edit it before sending.' : 'Taking you back to your chats.') : pendingQ ? 'Next: a quick tour, connect Kite, then your question runs.' : 'Next: a quick tour, then connect Kite.'}</p></div>`;
      sh.querySelector('.x').remove();
      pulse(sh);
      receipts(
        `<small>Signed in</small>${escH(mask(email))} · ${clock()}`,
        `<small>Next</small>${signin ? 'chat' : 'tour → Kite → ' + (pendingQ ? 'your answer' : 'chat')}`,
        true,
      );
      responseTimer = setTimeout(() => F2done(signin), 1800);
    } else if (step === 'listed') {
      sh.innerHTML =
        top(false, true, 1, "You're on the list") +
        `<div class="sh-bd"><div class="spot">#312 in line · ${clock()}</div>${qcard('saved · runs first')}
      <p>We'll email a sign-in code to <b style="color:var(--ink);font-weight:500">${escH(email)}</b> when your spot opens.</p>
      <button class="btn" id="dn">Done</button></div>`;
      $('#dn').onclick = close;
    }
    const x = sh.querySelector('.x');
    if (x) x.onclick = dismiss;
    startTick();
  }

  /* ---------- flow 02: states ---------- */
  function inbox2() {
    return `<div class="ib2" aria-label="The email, as it shows in your inbox"><span class="a2">/</span><div class="t2"><div class="r2"><b>/markets</b><em>now</em></div><div class="s2"><b>******</b> is your /markets code</div><div class="p2">It works for 10 minutes. If you didn’t ask for it, ignore this email.</div></div></div>`;
  }
  function F2done(signin) {
    const p = sh.querySelector('.sh-bd');
    if (!p) return;
    if (!signin || pendingQ) UX.queuedQuestion(pendingQ);
    const next = signin ? (pendingQ ? 'ask:draft' : 'ask:empty') : pendingQ ? 'tour:q' : 'tour:new';
    const label = signin ? 'Open chat' : 'Start the tour';
    p.insertAdjacentHTML('beforeend', `<a class="btn nx2" href="#" data-exit="${next}">${label} →</a>`);
    UX.event('signed-in');
  }
  function show2() {
    if (mode === 'email' && resumeAttempt()) return;
    pendingQ = mode === 'returning-question' ? OWN : '';
    keepAttempt = false;
    const signin = ['returning', 'existing-account', 'returning-question'].includes(mode);
    email =
      mode === 'email'
        ? ''
        : mode === 'invalid-email'
          ? 'you@'
          : mode === 'existing-account' || mode === 'returning-question'
            ? EXISTING_EMAIL
            : 'you@example.com';
    if (CODE_STEPS.includes(mode))
      attempt = {
        email,
        signin,
        code: FIRST_CODE + (mode === 'resent' ? 1 : 0),
        sentAt: Date.now() - (mode === 'expired' ? CODE_LIFETIME : 0),
      };
    if (attempt) demoCode = attempt.code;
    open(mode, signin);
  }

  mode = auth?.signedIn ? 'in' : UX.flow === 'homepage' ? initialState : 'open';
  close();
  paint();
  if (UX.flow === 'signup')
    setTimeout(() => {
      mode = initialState;
      paint();
      show2();
    }, 300);
  else if (mode === 'open' && !resumeAttempt() && auth?.signInOnLoad) open('email', true);
  return close;
}
