"""Signup states and email UI, with all API calls intercepted (no mail/account changes)."""
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

APP = os.environ.get('APP_BASE_URL', 'http://localhost:3000').rstrip('/')
OUT = Path('.v2-compare/notifications')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width in [1440, 390]:
        for returning in [False, True]:
            context = browser.new_context(viewport={'width': width, 'height': 900}, reduced_motion='no-preference')
            errors = []
            preferences = {'watchers': True, 'growth': True}
            def api(route):
                path = urlparse(route.request.url).path
                if path == '/api/auth/request-otp':
                    route.fulfill(json={'ok': True, 'existingAccount': returning})
                elif path == '/api/auth/verify-otp':
                    route.fulfill(json={'token': 'fixture', 'user': {'id': 'fixture', 'email': 'fixture@example.com'}, 'isNewAccount': not returning})
                elif path == '/api/onboarding':
                    route.fulfill(json={'pending': False, 'markets': []})
                elif path == '/api/broker':
                    route.fulfill(json={'status': 'not_connected'})
                elif path == '/api/threads': route.fulfill(json={'threads': []})
                elif path == '/api/watches': route.fulfill(json={'watches': []})
                elif path == '/api/usage': route.fulfill(json={'monthUsd': 0, 'allowanceUsd': 5, 'leftPct': 100, 'lowPct': 20, 'resetsOn': '2026-12-01'})
                elif path == '/api/notifications/preferences':
                    if route.request.method == 'PUT': preferences.update(route.request.post_data_json)
                    route.fulfill(json=preferences)
                elif path == '/api/notifications':
                    route.fulfill(json={'emails': [{'id':'mail1','subject':'Your watcher alert','sentAt':'2026-11-27',
                        'html':'<html><body style="background:#0F1114;color:white">Recorded watcher value: 101</body></html>', 'text':'Recorded watcher value: 101'}]})
                else: route.fulfill(status=404, json={})
            context.route(f'{APP}/api/**', api)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(APP)
            page.locator('#cta [data-act="signup"]').click()
            page.get_by_role('textbox', name='Email address').fill('fixture@example.com')
            page.get_by_role('button', name='Send code').click()
            expect(page.locator('html')).to_have_attribute('data-state', 'returning' if returning else 'code')
            if returning: expect(page.locator('.rt2')).to_be_visible()
            page.locator('.codes input').first.focus()
            page.keyboard.type('123456')
            expect(page.locator('html')).to_have_attribute('data-state', 'existing-account' if returning else 'done')
            expect(page.get_by_role('link', name='Open chat' if returning else 'Start the tour')).to_be_visible()
            page.screenshot(path=str(OUT / f'signup-{returning}-{width}.png'))

            page.goto(APP + '/chat?emailSettings=1')
            expect(page.get_by_label('Watcher emails', exact=True)).to_be_checked()
            page.get_by_label('Watcher emails', exact=True).uncheck()
            expect(page.get_by_role('status').filter(has_text='Email preferences saved.')).to_be_visible()
            assert preferences['watchers'] is False
            page.get_by_label('Getting-started reminders', exact=True).uncheck()
            expect(page.get_by_label('Getting-started reminders', exact=True)).not_to_be_checked()
            page.get_by_text('Sent emails', exact=True).click()
            page.get_by_role('button', name='Your watcher alert').click()
            expect(page.locator('iframe[title="Your watcher alert"]')).to_be_visible()
            assert page.locator('iframe').get_attribute('sandbox').find('allow-scripts') == -1
            page.screenshot(path=str(OUT / f'email-settings-{returning}-{width}.png'))
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.goto(APP + '/chat?connect=1')
            expect(page.get_by_role('dialog', name='Connect Kite', exact=True)).to_be_visible()
            page.goto(APP + '/chat?connect=faq')
            expect(page.locator('#ka')).to_be_visible()
            page.goto(APP + '/chat?view=watchers')
            expect(page.get_by_text('No watchers yet', exact=False)).to_be_visible()
            assert not errors, errors
            print(f'PASS {width}px returning={returning}: signup, saved preferences, sent preview, deep links, motion on, no overflow/errors', flush=True)
            context.close()
    browser.close()
