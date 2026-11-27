"""Exercise the public signup sheet and its OTP API contract without sending email."""
import os
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

APP = os.environ.get('APP_BASE_URL', 'http://localhost:3000').rstrip('/')
EMAIL = 'signup-fixture@example.com'
PROMPT = 'Compare INFY volume over the last seven sessions'

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(reduced_motion='reduce')
    requests = []
    errors = []

    def api(route):
        path = urlparse(route.request.url).path
        if path == '/api/auth/request-otp':
            requests.append((path, route.request.post_data_json))
            route.fulfill(json={'ok': True})
        elif path == '/api/auth/verify-otp':
            payload = route.request.post_data_json
            requests.append((path, payload))
            if payload['code'] == '651849':
                route.fulfill(json={'token':'signup-test', 'user':{'id':'fixture','email':EMAIL}})
            else:
                route.fulfill(status=401, json={'error':'Invalid or expired code.'})
        elif path == '/api/broker':
            route.fulfill(json={'status':'not_connected'})
        elif path == '/api/threads':
            route.fulfill(json={'threads':[]})
        else:
            route.fulfill(status=404, json={})

    context.route(f'{APP}/api/**', api)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(APP)
    expect(page.locator('.sample-label')).to_contain_text('Illustrative data')
    expect(page.locator('#depth')).to_be_attached()
    question = page.get_by_role('textbox', name='Ask the market')
    question.fill(PROMPT)
    question.press('Enter')
    page.get_by_role('textbox', name='Email address').fill(EMAIL)
    page.get_by_role('button', name='Send code').click()
    expect(page.locator('.ib2 .s2 b')).to_have_text('******')
    assert requests == [('/api/auth/request-otp', {'email': EMAIL})]
    assert set(page.evaluate("Object.keys(JSON.parse(sessionStorage.getItem('slash-home:signup-attempt')))")) <= {'email','pendingQ','signin','sentAt'}
    page.reload()
    expect(page.get_by_text('Continue with the code already sent to your email.')).to_be_visible()

    def paste_code(code):
        page.locator('.codes input').first.evaluate(
            """(input, code) => {
                const data = new DataTransfer();
                data.setData('text/plain', code);
                input.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data,bubbles:true,cancelable:true}));
            }""", code,
        )

    paste_code('417302')
    expect(page.locator('.codes')).to_have_class('codes bad')
    expect(page.locator('.codes input').first).to_have_value('')
    paste_code('651849')
    expect(page.get_by_text("You're in", exact=True)).to_be_visible()
    assert requests[-1] == ('/api/auth/verify-otp', {'email': EMAIL, 'code':'651849'})
    assert page.evaluate("localStorage.getItem('slash_kite.token')") == 'signup-test'
    assert page.evaluate("sessionStorage.getItem('slash-home:signup-attempt')") is None
    page.get_by_role('link', name='Open chat').click()
    page.wait_for_url(f'{APP}/chat')
    expect(page.locator('#form0 .in')).to_have_value(PROMPT)
    expect(page.locator('.msg.u')).to_have_count(0)
    page.goto(APP)
    expect(page.locator('#navr').get_by_role('link', name='Open chat')).to_be_visible()
    assert not errors, errors
    print('Public homepage, masked inbox, OTP requests, refresh, paste, rejection, sign-in and draft handoff passed.')

    page.goto(f'{APP}/lab/signup?s=code')
    expect(page.locator('.ib2 .s2 b')).to_have_text('******')
    print('Lab inbox is also masked.')
    browser.close()
