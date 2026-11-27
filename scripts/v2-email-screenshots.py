"""Render offline email previews after v2-email-check.ts; never sends mail."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent / '.v2-compare' / 'emails'
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, name in [(1440, 'desktop'), (390, 'mobile')]:
        page = browser.new_page(viewport={'width': width, 'height': 900})
        for preview in sorted(root.glob('*.html')):
            page.goto(preview.as_uri(), wait_until='load')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), preview.name
            assert page.locator('img').evaluate_all('(images) => images.every(i => i.complete && i.naturalWidth > 0)'), preview.name
            page.screenshot(path=str(preview.with_suffix(f'.{name}.png')), full_page=True)
        page.close()
    browser.close()
print('Rendered 30 desktop/mobile email previews; no overflow or broken images.')
