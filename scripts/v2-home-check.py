"""Exercise the V8 homepage and signup lab in a browser."""
import os

from playwright.sync_api import expect, sync_playwright

APP = os.environ.get('APP_BASE_URL', 'http://localhost:3000').rstrip('/')
PROMPT = 'Compare INFY volume over the last seven sessions'


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(reduced_motion='reduce', viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def open_lab(flow, state):
        page.goto(f'{APP}/lab/{flow}?s={state}')
        page.wait_for_selector('#q')

    def enter_code(code):
        digits = page.locator('.codes input')
        digits.first.focus()
        page.keyboard.type(code)

    page.clock.install()
    open_lab('homepage', 'open')
    expect(page.locator('#sw')).to_be_visible()
    expect(page.locator('#ss')).to_be_visible()
    page.get_by_role('button', name='Nifty gap-downs: how often green?').click()
    expect(page.locator('#obody')).to_contain_text('41 gap-downs')
    page.get_by_role('button', name='Close banner').click()
    expect(page.locator('#banner')).to_be_hidden()
    page.set_viewport_size({'width': 1000, 'height': 900})
    expect(page.locator('html')).to_have_css('zoom', '0.694444')
    page.set_viewport_size({'width': 1440, 'height': 900})
    print('Homepage sample, Split sections, banner and narrow-desktop scaling passed.', flush=True)

    question = page.get_by_role('textbox', name='Ask the market')
    question.fill(PROMPT)
    question.press('Enter')
    expect(page.locator('#sheet .qcard > span')).to_have_text(PROMPT)
    email = page.get_by_role('textbox', name='Email address')
    email.fill('invalid@')
    page.get_by_role('button', name='Send code').click()
    expect(email).to_have_attribute('aria-invalid', 'true')
    email.fill('returning@example.com')
    page.get_by_role('button', name='Send code').click()
    expect(page.locator('.codes input')).to_have_count(6)
    enter_code('000000')
    expect(page.locator('.codes')).to_have_class('codes bad')
    expect(page.locator('.codes input').first).to_have_value('')
    page.clock.run_for(31_000)
    page.reload()
    expect(page.get_by_text('Continue with the code already sent to your email.')).to_be_visible()
    expect(page.locator('#sheet .qcard > span')).to_have_text(PROMPT)
    expect(page.get_by_role('button', name='resend code', exact=True)).to_be_enabled()
    enter_code('417302')
    page.get_by_role('link', name='Open chat').click()
    page.wait_for_url('**/lab/ask?s=draft')
    expect(page.get_by_role('textbox').filter(visible=True).first).to_have_value(PROMPT)
    expect(page.locator('.msg.u')).to_have_count(0)
    print('Question handoff, email validation, wrong code, resume and returning draft passed.', flush=True)

    open_lab('signup', 'expired')
    expect(page.locator('.codes input').first).to_be_disabled()
    page.get_by_role('button', name='Send a new code').click()
    expect(page.get_by_text('A new code was sent. Use the latest email.')).to_be_visible()
    enter_code('417302')
    expect(page.locator('.codes')).to_have_class('codes bad')
    enter_code('417303')
    expect(page.get_by_role('link', name='Start the tour')).to_be_visible()
    page.get_by_role('link', name='Start the tour').click()
    page.wait_for_url('**/lab/tour?s=new')
    print('Expiry, resend, old-code rejection and tour handoff passed.', flush=True)

    open_lab('homepage', 'wait')
    page.get_by_role('link', name='Join waitlist').first.click()
    page.get_by_role('textbox', name='Email address').fill('you@example.com')
    page.get_by_role('button', name='Join waitlist').click()
    expect(page.locator('#sheet')).to_contain_text('#312 in line')
    expect(page.locator('.codes')).to_have_count(0)
    assert not errors, errors
    print('Waitlist fixture and clean browser console passed.', flush=True)
    browser.close()
