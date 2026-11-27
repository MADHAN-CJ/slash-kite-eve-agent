/* Static markup shared by the homepage and sign-up previews. */
export const HOME_MARKUP = String.raw`
<div class="banner" id="banner">New: share any chart you make, and anyone can Remix it. <a href="#">See how</a>
  <button class="x" aria-label="Close banner"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
</div>

<nav>
  <a href="#" aria-label="/markets home"><img class="logo" src="/v2/img/wordmark.svg" alt="/markets"></a>
  <div class="links">
    <a href="#">Product <svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></a>
    <a href="#">Markets <svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></a>
    <a href="#">Gallery</a>
    <a href="#" data-act="ai">Connect your AI</a>
    <a href="#">Docs</a>
    <a href="#">Pricing</a>
  </div>
  <div class="r" id="navr"><a class="ghost" href="#" data-act="signin">Sign in</a><a class="btn" href="#" data-act="signup">Sign up</a></div>
</nav>

<section class="hero">
  <div class="depth" aria-hidden="true">
    <canvas id="depth" class="hole"></canvas>
    <span class="brk" id="bidbrk" style="left:24px;top:110px">[ NIFTY FUT · BIDS ]</span>
    <span class="brk" id="askbrk" style="right:24px;top:110px">[ ASKS ]</span>
    <div class="rcpt l" id="rl"></div>
    <div class="rcpt r" id="rr"></div>
  </div>

  <div class="hero-in">
    <h1 id="h1">Search the market like the web</h1>
    <p class="sub" id="sub">Ask about any stock, level or indicator. Your agent does the analysis.</p>
    <div class="cta" id="cta"><a class="btn" href="#" data-act="signup">Sign up free</a></div>

    <div class="pg" id="pg">
      <div class="pg-top">
        <div class="qrow">
          <input id="q" autocomplete="off" spellcheck="false" aria-label="Ask the market" placeholder="Ask about NSE or MCX, or say “tell me when…”">
          <button class="hint" id="hint" tabindex="-1"></button>
        </div>
        <div class="ctrl">
          <span class="schip" id="schip"></span>
          <span class="sp"></span>
          <button class="ib" id="clr" aria-label="Clear"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          <button class="go" id="go" aria-label="Run"><svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg></button>
        </div>
        <i class="prog" id="prog"></i>
      </div>

      <div class="pg-body">
        <aside class="set">
          <div>
            <div class="lab">Data</div>
            <div class="opts two" id="data">
              <button class="opt on" data-d="del">Delayed <small>15m</small></button>
              <button class="opt" data-d="brk"><svg class="kite" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L4.5 12 12 22z" fill="#E8471C"/><path d="M12 2l7.5 10L12 22z" fill="#FF7A45"/></svg>Kite login</button>
            </div>
            <p class="note" id="dnote">Free. NSE and MCX, 15 minutes behind.</p>
          </div>
          <div>
            <div class="lab">Market</div>
            <div class="opts three" id="mkts">
              <button class="opt on" data-m="idx">Indices</button>
              <button class="opt" data-m="stk">Stocks</button>
              <button class="opt" data-m="fo">F&amp;O</button>
              <button class="opt" data-m="mcx">Commodities</button>
              <button class="opt" data-m="chain">Chains</button>
              <button class="opt" data-m="hold" id="hold" disabled title="Log in with Kite">Holdings</button>
            </div>
          </div>
          <div class="foot">
            <a class="ghost" href="https://claude.ai/customize/connectors?modal=add-custom-connector&amp;connectorName=%2Fmarkets&amp;connectorUrl=https%3A%2F%2Fmcp.slash.markets%2F" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="#D97757"><path d="M12 2.5l1.6 6.3 5.6-3.4-3.4 5.6 6.3 1.6-6.3 1.6 3.4 5.6-5.6-3.4L12 21.5l-1.6-6.3-5.6 3.4 3.4-5.6L1.9 12l6.3-1.6-3.4-5.6 5.6 3.4z"/></svg>Add to Claude <svg class="i" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/></svg></a>
            <button class="ghost sq" aria-label="Show code"><svg class="i" viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg></button>
          </div>
        </aside>

        <div class="out" id="out">
          <div class="out-head" id="ohead"></div>
          <div class="panes" id="panes">
            <div class="run"><div class="runline" id="runline">Running next to the data…</div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
            <div id="obody"></div>
          </div>
          <div id="ofoot"></div>
        </div>
      </div>
    </div>

    <div class="back" id="back"></div>
    <div class="tries" id="tries"></div>
    <p class="fine">Facts and calculations only, no tips.</p>
  </div>
</section>

<main class="secs" id="secs"></main>


<div class="ov" id="ov" role="dialog" aria-modal="true" aria-label="Sign up"><div class="sheet" id="sheet"></div></div>
<div class="srcpt l" id="srl"></div><div class="srcpt r" id="srr"></div>
<div class="toast2" id="toast2"></div>
`;
