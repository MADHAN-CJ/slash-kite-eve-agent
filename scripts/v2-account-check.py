"""V7 lab twin check: the same clicks in the prototype and React account panel.

Needs the app at :3000 and markets-hero at :8770. No accounts or API writes.
The chat checks use fixture API responses to avoid changing a real Kite account.
  /usr/bin/python3 scripts/v2-account-check.py
"""
import os
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

APP = os.environ.get('APP_BASE_URL', 'http://localhost:3000').rstrip('/')
PROTO = os.environ.get('MARKETS_HERO_URL', 'http://localhost:8770/ux').rstrip('/')
OUT = Path(__file__).resolve().parent.parent / '.v2-compare' / 'account-interactions'
OUT.mkdir(parents=True, exist_ok=True)
FIXED = '2026-11-25T14:33:00+05:30'
STILL = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}'
SEED = 'let s=42;Math.random=()=>((s=(s*16807)%2147483647)/2147483647);'
n = 0


def check(label, ok):
    global n
    n += 1
    print(('✓' if ok else '✗') + f' {n}. {label}', flush=True)
    assert ok, label


def settle(page, ms=500):
    for _ in range(ms // 500):
        page.clock.run_for(500)
        page.wait_for_timeout(10)


def compare(label, ours, proto):
    a_path, b_path = OUT / f'{n+1}.ours.png', OUT / f'{n+1}.ref.png'
    for page in (ours, proto):
        settle(page)
    ours.screenshot(path=str(a_path))
    proto.screenshot(path=str(b_path))
    a, b = Image.open(a_path).convert('RGB'), Image.open(b_path).convert('RGB')
    d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
    ratio = sum(1 for v in d.getdata() if v) / (a.width * a.height)
    side = Image.new('RGB', (a.width+b.width+16, a.height), (255,0,255))
    side.paste(b,(0,0)); side.paste(a,(b.width+16,0))
    side.save(OUT / f'{n+1}.side.png')
    check(f'{label} ({ratio*100:.2f}% differs)', ratio <= 0.002)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    errors = []
    for device, options in [('desktop', {'viewport':{'width':1440,'height':900}}), ('mobile', {'viewport':{'width':390,'height':844},'is_mobile':True,'has_touch':True})]:
        pages = []
        for base in (APP, PROTO):
            ctx = browser.new_context(device_scale_factor=1, reduced_motion='reduce', permissions=['clipboard-read','clipboard-write'], **options)
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.clock.install(time=FIXED)
            page.add_init_script(SEED + 'localStorage.clear()')
            path = '/lab/account?s=on' if base == APP else '/flows/account/?s=on&chrome=0'
            page.goto(base+path, wait_until='load')
            page.add_style_tag(content=STILL)
            settle(page,20000)
            pages.append(page)
        ours, proto = pages
        def both(fn):
            for p in pages:
                fn(p)
        compare(device+' connected', ours, proto)
        both(lambda p: p.click('[data-k=ask]'))
        check(device+' disconnect asks once before changing status', ours.locator('.cf').is_visible() and ours.locator('.hk8.on').is_visible())
        compare(device+' disconnect confirm', ours, proto)
        both(lambda p: p.click('[data-k=keep]'))
        check(device+' Keep preserves connection', not ours.locator('.cf').count() and ours.locator('.hk8.on').is_visible())
        both(lambda p: p.click('[data-k=ask]'))
        both(lambda p: p.click('[data-k=disc]'))
        compare(device+' disconnected', ours, proto)
        check(device+' shell reflects disconnected status', ours.locator('#ws').inner_text() == 'Kite disconnected')
        both(lambda p: p.click('[data-k=connect]'))
        check(device+' reconnect waits', ours.locator('.hk8.wait').is_visible() and ours.locator('.go').is_disabled())
        both(lambda p: p.click('[data-k=cancel]'))
        both(lambda p: settle(p,3000))
        check(device+' cancel prevents a later fake success', ours.locator('.hk8.out').is_visible() and not ours.locator('.hk8.wait').count())
        both(lambda p: p.click('[data-k=connect]'))
        both(lambda p: settle(p,3000))
        check(device+' completed reconnect updates card and shell', ours.locator('.hk8.on').is_visible() and 'Kite connected' in ours.locator('#ws').inner_text())
        compare(device+' reconnected', ours, proto)
        both(lambda p: p.click('[data-k=mcp]'))
        compare(device+' Claude connector instructions', ours, proto)
        both(lambda p: p.click('[data-k=copy]'))
        check(device+' Copy shows success and the exact fixture URL', ours.locator('[data-k=copy]').inner_text() == 'Copied' and ours.evaluate('navigator.clipboard.readText()') == 'https://slash.markets/mcp')
        both(lambda p: settle(p,1500))
        check(device+' copy label resets after 1400 ms', ours.locator('[data-k=copy]').inner_text() == 'Copy')
        both(lambda p: p.click('[data-k=tab][data-v=gpt]'))
        compare(device+' ChatGPT review tab', ours, proto)
        both(lambda p: p.keyboard.press('Escape'))
        check(device+' Escape closes', not ours.locator('#pf8s').is_visible())
        # Account is inside the phone drawer; expose the same drawer on each.
        if device == 'mobile':
            both(lambda p: p.click('#menu'))
        both(lambda p: p.click('#av'))
        check(device+' reopening preserves the connector tab', ours.locator('.so8').is_visible())
        both(lambda p: p.click('[data-k=back]'))
        both(lambda p: p.click('#pf8s', position={'x':430 if device=='desktop' else 10,'y':10}))
        check(device+' outside click closes', not ours.locator('#pf8s').is_visible())
        for p in pages:
            p.context.close()
    check('no browser errors', not errors)
    # Test motion with the real animations enabled, apart from snapshot passes.
    motion = browser.new_page(viewport={'width':1440,'height':900}, reduced_motion='no-preference')
    motion.goto(APP+'/lab/account?s=wait')
    motion.wait_for_selector('.sp8')
    check('entrance and spinner retain 180 ms / 800 ms timings', motion.locator('.pf8').evaluate('(e)=>getComputedStyle(e).animationDuration') == '0.18s' and motion.locator('.sp8').evaluate('(e)=>getComputedStyle(e).animationDuration') == '0.8s')
    motion.emulate_media(reduced_motion='reduce')
    check('reduced motion stops both animations', motion.locator('.pf8').evaluate('(e)=>getComputedStyle(e).animationName') == 'none' and motion.locator('.sp8').evaluate('(e)=>getComputedStyle(e).animationName') == 'none')
    # Exercise the normal sidebar entry point and real client API wiring.
    chat = browser.new_context(viewport={'width': 1440, 'height': 900})
    chat.add_init_script(
        "if (location.pathname === '/chat') { localStorage.setItem('slash_kite.token','account-fixture');"
        "localStorage.setItem('slash_kite.user',JSON.stringify({id:'account-test',email:'account@example.com'})); }"
    )
    broker = dict(status='active', kiteUserId='TEST', userName=None,
                  connectedAt='2026-11-25T08:00:00Z', expiresAt='2026-11-26T00:30:00Z',
                  publisherApiKey=None)
    writes = []
    def api(route):
        from urllib.parse import urlparse
        path = urlparse(route.request.url).path
        method = route.request.method
        if path == '/api/broker':
            if method == 'DELETE':
                writes.append('disconnect')
                broker.update(status='disconnected', disconnectedAt='2026-11-25T09:00:00Z')
            route.fulfill(json=broker)
        elif path == '/api/usage':
            route.fulfill(json=dict(monthUsd=4.6, allowanceUsd=5, leftPct=8, resetsOn='2026-12-01'))
        elif path == '/api/threads':
            route.fulfill(json={'threads': []})
        elif path == '/api/watches':
            route.fulfill(json={'watches': [{'status':'PAUSED','pausedBy':'broker'}]})
        elif path == '/api/broker/kite/login/start':
            route.fulfill(status=502, json={'error':'Test login failure'})
        elif path == '/api/auth/logout':
            writes.append('logout')
            route.fulfill(json={'ok':True})
        else:
            route.fulfill(status=404,json={})
    chat.route(APP+'/api/**',api)
    live = chat.new_page()
    live.clock.set_fixed_time(FIXED)
    live.goto(APP+'/chat')
    live.click('#av')
    live.wait_for_selector('.hk8.on')
    check('sidebar opens Account with the signed-in email', live.locator('.me8 b').inner_text() == 'account@example.com')
    live.wait_for_selector('.us8.low')
    check('real usage and reset date match the chat allowance', '92%used' in live.locator('.us8 .big').text_content() and live.locator('.us8 em').inner_text() == 'resets 1 Dec' and live.locator('.us8 .lg .w').count() == 0)
    live.click('[data-k=mcp]')
    check('Claude shows a configured connector URL', live.locator('.cp8 code').inner_text().startswith(('http://','https://')))
    live.click('[data-k=tab][data-v=gpt]')
    check('ChatGPT remains marked In review', live.locator('.so8').inner_text() == 'In review')
    live.click('[data-k=back]')
    live.click('[data-k=ask]')
    live.click('[data-k=keep]')
    check('Keep does not send a disconnect request', writes == [])
    live.click('[data-k=ask]')
    live.click('[data-k=disc]')
    live.wait_for_selector('.hk8.out')
    live.wait_for_function("document.querySelector('.hk8 .ft')?.textContent.includes('1 watcher is waiting')")
    check('confirmed disconnect updates account and gates chat', writes == ['disconnect'] and '14:30' in live.locator('.hk8 .sub').inner_text() and 'disconnected' in live.locator('#nbt').inner_text())
    live.click('#pf8 [data-k=connect]')
    live.wait_for_selector('#kv.is-on')
    check('account Connect opens the existing Kite dialog', not live.locator('#pf8').is_visible())
    live.keyboard.press('Escape')
    live.wait_for_selector('#pf8')
    check('closing Kite returns to the disconnected account', live.locator('.hk8.out').is_visible())
    live.click('#pf8 [data-k=connect]')
    live.locator('#kv').get_by_role('button', name='Log in with Kite', exact=True).click()
    live.wait_for_selector('#kv #kc')
    live.locator('#kv').get_by_role('button', name='Not now').click()
    live.wait_for_selector('#pf8 .ac8-error')
    check('failed reconnect returns to Account with Try again', live.locator('#pf8 [data-k=connect]').inner_text() == 'Try again')
    live.click('#pf8 [data-k=out]')
    live.wait_for_url(APP+'/')
    check('sign-out calls the session endpoint and returns home', writes == ['disconnect','logout'] and live.evaluate("localStorage.getItem('slash_kite.token')") is None)
    browser.close()
print(f'\nall {n} checks passed', flush=True)
