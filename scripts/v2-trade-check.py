"""V6: prototype interactions + the REAL Publisher SDK on the running /chat.

App REST responses are fixtures, so no personal data or live broker session is
needed. The official publisher.js is unmodified; its basket POST is intercepted
before it reaches Zerodha, inspected, and given a plain stand-in. No order is
placed. API authorization and the MCP read are tested in trade-market.test.ts.

  /usr/bin/python3 scripts/v2-trade-check.py
Env APP_BASE_URL defaults to http://localhost:3000.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

APP = os.environ.get('APP_BASE_URL', 'http://localhost:3000').rstrip('/')
OUT = Path(__file__).resolve().parent.parent / '.v2-compare' / 'trade'
n = 0


def check(label, condition):
    global n
    n += 1
    print(('✓' if condition else '✗') + f' {n}. {label}', flush=True)
    assert condition, label


def settle(page):
    page.wait_for_timeout(300)


def instrument(symbol='GOLDBEES', exchange='NSE', lot=1):
    return dict(key=f'{exchange}:{symbol}', symbol=symbol, exchange=exchange,
                kind='future' if lot > 1 else 'equity', lotSize=lot, tickSize=0.05,
                expiry='2026-12-29' if lot > 1 else None, lastPrice=99.82 if lot == 1 else 24265,
                asOf='2026-11-27T14:32:00+05:30')


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    # The lab uses the same component, with the prototype's made-up fixtures.
    page.goto(f'{APP}/lab/trade?s=answer')
    page.wait_for_selector('.go7')
    check('answer requires a side', page.locator('.go7').is_disabled())
    page.click('[data-k=side][data-v=SELL]')
    check('Sell updates the action and colour', 'sell' in page.locator('.go7').get_attribute('class') and page.locator('.go7').inner_text() == 'Sell on Kite')
    page.click('[data-k=type][data-v=LIMIT]')
    check('Limit starts at the last price', page.locator('#p7').input_value() == '2948.4')
    page.fill('#p7', '0')
    check('zero price shows an error and disables handoff', page.locator('#p7-error').is_visible() and page.locator('.go7').is_disabled())
    page.fill('#p7', '2900')
    page.fill('#q7', '1.5')
    check('fractional quantity is blocked', page.locator('#q7-error').is_visible() and page.locator('.go7').is_disabled())
    page.fill('#q7', '2')
    check('corrected fields update order value', page.locator('.sm7 b').inner_text() == '₹5,800.00')
    page.click('.go7')
    page.wait_for_selector('.kw7')
    check('handoff summary preserves Sell, quantity and Limit', 'Sell 2 RELIANCE · CNC · Limit 2,900.00' in page.locator('.od7').inner_text())
    page.click('[data-k=kclose]')
    check('closed view avoids claiming execution', "can’t tell you if it went through" in page.locator('.ms7 p').inner_text())
    page.click('[data-k=again]')
    check('Trade again preserves the form', page.locator('#q7').input_value() == '2' and page.locator('#p7').input_value() == '2900')
    page.keyboard.press('Escape')
    check('Escape dismisses', not page.locator('#tk7s').count())
    page.goto(f'{APP}/lab/trade?s=fno')
    page.wait_for_selector('#q7')
    page.click('[data-k=qp]')
    check('futures use lots and show units', page.locator('.sm7 b').inner_text() == '₹36,39,750.00 · 150 units')
    page.goto(f'{APP}/lab/trade?s=watcher')
    page.wait_for_selector('.hn7')
    check('watcher Buy and explanatory hint are preserved', page.locator('[data-v=BUY][data-k=side]').get_attribute('aria-pressed') == 'true')
    page.click('[data-k=side][data-v=SELL]')
    check('choosing Sell removes the Buy hint', not page.locator('.hn7').count())

    # Wire the real ChatApp to deterministic REST data, then let the real SDK run.
    now = '2026-11-27T09:03:00Z'
    watch = dict(id='v6-watcher', symbol='NSE:GOLDBEES', label='Price drops below 100', market='NSE', status='ARMED',
                 statusReason=None, pausedBy=None, checkEveryMinutes=1, lastCheckedAt=now, lastValue='99.82',
                 lastDetail=None, lastError=None, alertCount=0, lastAlertAt=None, expiresAt='2099-12-31T00:00:00Z',
                 createdAt=now, recentAlerts=[], lastMet=False, script='print(99.82)', threadId=None, threadTitle=None, updatedAt=now)
    market = {'instruments': [instrument()], 'selectedKey': 'NSE:GOLDBEES'}
    market_error = None
    requests = []
    baskets = []
    thread = dict(id='v6-chat', title='GOLDBEES levels', eveSessionId='fixture-session', createdAt=now, updatedAt=now)
    def message(mid, role, content, parts=None):
        return dict(id=mid, role=role, content=content, parts=parts or [], usage=None, cost=None, createdAt=now)
    def tool(cid, name, arguments, output):
        return [dict(type='tool_call', toolCallId=cid, toolName=name, input=arguments), dict(type='tool_result', toolCallId=cid, toolName=name, output=output)]
    messages = [
        message('q1', 'user', 'Where is GOLDBEES against 100 today?'),
        message('a1', 'assistant', 'GOLDBEES is at 99.82.', tool('quote', 'kite__run_python', {'code':'# Read the quote\nprint(z.quote(["NSE:GOLDBEES"]))'}, '@@source '+json.dumps(dict(dataset='Quote',symbol='GOLDBEES',rows=1,values=[['Price','99.82']])))),
        message('q2', 'user', 'Tell me when GOLDBEES drops below 100'),
        message('a2', 'assistant', 'Your watcher is running.', tool('watch', 'kite__create_watcher', dict(symbol='NSE:GOLDBEES', market='NSE', label='Price drops below 100', script='print(99.82)', check_every_minutes=1, expires_in_days=7), {'created':True,'watcher':{'market':'NSE'}})),
    ]

    def rest(route):
        path = urlparse(route.request.url).path
        requests.append((route.request.method, path, route.request.post_data))
        if path == '/api/broker':
            data = dict(status='active', kiteUserId='TEST', userName='Fixture', connectedAt=now, expiresAt='2099-12-31T00:00:00Z', publisherApiKey='v6-test-only')
        elif path == '/api/threads':
            data = {'threads': [thread]}
        elif path == '/api/threads/v6-chat':
            data = {**thread, 'streamIndex':0, 'messages':messages}
        elif path == '/api/usage':
            data = dict(monthUsd=1, allowanceUsd=5, leftPct=80, resetsOn='2099-12-31')
        elif path == '/api/watches':
            data = {'watches': [watch]}
        elif path == '/api/trade/market':
            if market_error:
                route.fulfill(status=409, json={'error': market_error, 'code': 'KITE_REQUIRED'})
                return
            data = market
        elif path.startswith('/api/eve/'):
            route.fulfill(status=404, json={})
            return
        else:
            route.fulfill(status=500, json={'error': f'Unexpected API in test: {path}'})
            return
        route.fulfill(json=data)

    def basket(route):
        baskets.append(parse_qs(route.request.post_data))
        route.fulfill(content_type='text/html', body='<title>Kite basket handoff</title><p>Intercepted test handoff. No order placed.</p>')

    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    ctx.route(f'{APP}/api/**', rest)
    ctx.route('https://kite.zerodha.com/connect/basket', basket)
    ctx.add_init_script("localStorage.setItem('slash_kite.token','test-fixture');localStorage.setItem('slash_kite.user',JSON.stringify({id:'v6-test',email:'you@example.com'}));")
    live = ctx.new_page()
    live.on('pageerror', lambda e: errors.append(str(e)))
    live.goto(f'{APP}/chat')
    live.click('#navalerts')
    live.wait_for_selector('.pn8 [data-a=trade]')
    live.click('.pn8 [data-a=trade]')
    live.wait_for_selector('.go7:not(:disabled)', timeout=30000)
    check('real watcher entry uses its symbol, source rule and Buy guess', live.locator('.sy7 b').inner_text() == 'GOLDBEES' and 'Price drops below 100' in live.locator('.sy7 .fr').inner_text() and live.locator('.go7').inner_text() == 'Buy on Kite')
    live.click('[data-k=side][data-v=SELL]')
    live.click('[data-k=type][data-v=LIMIT]')
    live.fill('#q7', '3')
    live.fill('#p7', '100.25')
    with live.expect_popup() as opened:
        live.click('.go7')
    popup = opened.value
    popup.wait_for_url('**/connect/basket')
    check('official Publisher reaches the basket URL', popup.url == 'https://kite.zerodha.com/connect/basket')
    payload = json.loads(baskets[-1]['data'][0])
    check('one current basket entry, with exact edited fields', payload == [dict(exchange='NSE', tradingsymbol='GOLDBEES', transaction_type='SELL', order_type='LIMIT', quantity=3, product='CNC', price=100.25)])
    check('only the public API key goes into the browser handoff', baskets[-1]['api_key'] == ['v6-test-only'])
    popup.close()
    live.wait_for_selector('.ms7.ok')
    check('manual popup close is detected', live.locator('.ms7 h3').inner_text() == 'Kite’s window closed')
    live.click('[data-k=again]')
    live.evaluate('() => { window.savedOpen=window.open; window.open=()=>null; }')
    live.click('.go7')
    live.wait_for_selector('.ms7.er')
    check('blocked Publisher popup is detected', 'didn’t open' in live.locator('.ms7 h3').inner_text())
    live.evaluate('() => { window.open=window.savedOpen; }')
    with live.expect_popup() as opened:
        live.click('.bt7 [data-k=go]')
    popup = opened.value
    popup.wait_for_url('**/connect/basket')
    check('retry does not duplicate basket entries', len(json.loads(baskets[-1]['data'][0])) == 1)
    live.evaluate("window.postMessage(JSON.stringify({type:'basket',status:'cancelled',request_token:null}),window.location.origin)")
    live.wait_for_selector('.ms7.ok')
    check('official finished callback shows the neutral closed state', 'can’t tell you' in live.locator('.ms7 p').inner_text())
    live.click('.bt7 [data-k=close]')
    check('Done returns to the Watchers screen', live.locator('.pn8').is_visible())
    live.click('.ss[data-id=v6-chat]')
    live.wait_for_selector('.wc5.is-live')
    live.locator('.msg.a').first.locator('[data-f5=trade]').click()
    live.wait_for_selector('.go7')
    live.wait_for_function("!document.querySelector('.trade-note[role=status]')")
    check('answer action opens the ticket with its own question and no guessed side', 'From the answer · Where is GOLDBEES against 100 today?' in live.locator('.sy7 .fr').inner_text() and live.locator('[data-k=side][aria-pressed=true]').count() == 0)
    live.keyboard.press('Escape')
    live.locator('.wc5 [data-f5=trade]').click()
    live.wait_for_selector('.go7:not(:disabled)')
    check('watcher card action opens its rule and Buy guess from history', 'From your watcher · Price drops below 100' in live.locator('.sy7 .fr').inner_text() and live.locator('[data-k=side][data-v=BUY]').get_attribute('aria-pressed') == 'true')
    live.keyboard.press('Escape')

    # An email link opens the real ticket, then clears only its query fields.
    live.goto(f'{APP}/chat?trade=1&tradingsymbol=GOLDBEES&exchange=NSE&side=BUY&quantity=5&from=email&context=today%2014:05&rule=Price%20drops%20below%20100')
    live.wait_for_selector('.go7:not(:disabled)')
    check('email deep link carries quantity and source', live.locator('#q7').input_value() == '5' and 'From your alert email · today 14:05' in live.locator('.sy7 .fr').inner_text())
    check('trade query is consumed', urlparse(live.url).query == '')

    # Real metadata may have a different lot size from the prototype fixture.
    market = {'instruments': [instrument('NIFTY26DECFUT', 'NFO', 65), instrument('NIFTY27JANFUT','NFO',65)], 'selectedKey': None}
    live.goto(f'{APP}/chat?trade=1&tradingsymbol=NIFTY')
    live.wait_for_selector('#contract7')
    check('an index never silently selects a futures contract or a side', live.locator('#contract7').input_value() == '' and live.locator('.go7').is_disabled() and live.locator('[data-k=side][aria-pressed=true]').count() == 0)
    live.select_option('#contract7', 'NFO:NIFTY27JANFUT')
    live.click('[data-k=side][data-v=BUY]')
    live.fill('#q7', '2')
    with live.expect_popup() as opened:
        live.click('.go7')
    popup = opened.value
    popup.wait_for_url('**/connect/basket')
    check('selected contract and real lot size reach Publisher', json.loads(baskets[-1]['data'][0])[0]['tradingsymbol'] == 'NIFTY27JANFUT' and json.loads(baskets[-1]['data'][0])[0]['quantity'] == 130)
    popup.close()
    live.wait_for_selector('.ms7.ok')
    market_error = 'Reconnect Kite to load the instrument and last price.'
    live.goto(f'{APP}/chat?trade=1&tradingsymbol=GOLDBEES&side=BUY')
    live.wait_for_selector('.trade-note[role=alert]')
    check('metadata failure offers reconnect and blocks handoff', 'Reconnect Kite' in live.locator('.trade-note[role=alert]').inner_text() and live.locator('.go7').is_disabled())
    check('the existing full order form stays available without market metadata', live.locator('.trade-note a').get_attribute('href').startswith('/?trade=1'))
    check('order details never go to an app endpoint', all(method == 'GET' and body is None for method, path, body in requests if '/trade/' in path))
    check('no browser errors', not errors)

    # Motion constants and reduced-motion behavior, measured in the browser.
    motion = browser.new_page(viewport={'width': 1440,'height':900}, reduced_motion='no-preference')
    motion.goto(f'{APP}/lab/trade?s=window')
    motion.wait_for_selector('.kw7')
    check('ticket and spinner retain prototype timings', motion.locator('.tk7').evaluate('(e)=>getComputedStyle(e).animationDuration') == '0.22s' and motion.locator('.ms7 .sp').evaluate('(e)=>getComputedStyle(e).animationDuration') == '0.9s')
    motion.emulate_media(reduced_motion='reduce')
    check('reduced motion stops the entrance and spinner', motion.locator('.tk7').evaluate('(e)=>getComputedStyle(e).animationName') == 'none' and motion.locator('.ms7 .sp').evaluate('(e)=>getComputedStyle(e).animationName') == 'none')

    market_error = None
    market = {'instruments': [instrument()], 'selectedKey': 'NSE:GOLDBEES'}
    phone = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True,
                                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Version/15.0 Mobile/15E148 Safari/604.1')
    phone.route(f'{APP}/api/**', rest)
    phone.route('https://kite.zerodha.com/connect/basket', basket)
    phone.add_init_script("localStorage.setItem('slash_kite.token','test-fixture');localStorage.setItem('slash_kite.user',JSON.stringify({id:'v6-test',email:'you@example.com'}));")
    mobile = phone.new_page()
    mobile.goto(f'{APP}/chat?trade=1&tradingsymbol=GOLDBEES&side=BUY')
    mobile.wait_for_selector('.go7:not(:disabled)')
    check('phone ticket is the prototype bottom sheet', mobile.locator('.tk7').bounding_box()['width'] == 390)
    mobile.click('.go7')
    mobile.wait_for_selector('#kite-frame')
    mobile.frame_locator('#kite-frame').locator('text=Intercepted test handoff. No order placed.').wait_for()
    check('mobile uses the official Publisher iframe handoff', mobile.locator('#kite-modal-wrap').is_visible() and json.loads(baskets[-1]['data'][0])[0]['tradingsymbol'] == 'GOLDBEES')
    mobile.evaluate("window.postMessage(JSON.stringify({type:'basket',status:'cancelled',request_token:null}),window.location.origin)")
    mobile.wait_for_selector('.ms7.ok')
    check('mobile Publisher completion restores the sheet', mobile.locator('.tk7').is_visible())

    # Signed-out email links survive email-OTP login, using the existing login form.
    signed_out = browser.new_context(viewport={'width':1440,'height':900})
    login_requests = []
    def login_rest(route):
        path = urlparse(route.request.url).path
        login_requests.append((path, route.request.post_data))
        if path == '/api/auth/request-otp':
            route.fulfill(json={'ok':True})
        elif path == '/api/auth/verify-otp':
            route.fulfill(json={'token':'test-fixture','user':{'id':'v6-test','email':'you@example.com'}})
        else:
            rest(route)
    signed_out.route(f'{APP}/api/**', login_rest)
    anon = signed_out.new_page()
    anon.goto(f'{APP}/chat?trade=1&tradingsymbol=GOLDBEES&side=BUY&quantity=7&from=email')
    anon.wait_for_selector('input[type=email]')
    anon.wait_for_function("Object.keys(document.querySelector('input[type=email]')).some(k=>k.startsWith('__reactProps$'))")
    check('signed-out trade link goes to login with a return path', 'returnTo=' in anon.url)
    anon.fill('input[type=email]', 'you@example.com')
    anon.get_by_role('button', name='Send login code').click()
    try:
        anon.wait_for_selector('input[inputmode=numeric]', timeout=10000)
    except Exception:
        print('Login diagnostics:', login_requests, anon.locator('body').inner_text(), flush=True)
        raise
    anon.fill('input[inputmode=numeric]', '123456')
    anon.get_by_role('button', name='Sign in', exact=True).click()
    anon.wait_for_selector('.go7:not(:disabled)')
    check('login returns to the original prefilled ticket', '/chat' in anon.url and anon.locator('#q7').input_value() == '7' and 'From your alert email' in anon.locator('.sy7 .fr').inner_text())
    browser.close()

print(f'\nall {n} checks passed', flush=True)
