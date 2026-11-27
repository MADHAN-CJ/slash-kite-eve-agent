"""Twin check for the v2 chat shell (plan-v2-ui V2): drive the markets-hero prototype
and our lab page through the SAME interactions and compare the pixels after each one.

Both pages are opened like the prototype's own suite opens its pages (frozen clock,
seeded random, reduced motion, animations off). Needs `npm run dev` here and
`npm run serve` in markets-hero. Images land in .v2-compare/shell/.

  /usr/bin/python3 scripts/v2-shell-check.py
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
PROTO = os.environ.get("MARKETS_HERO_URL", "http://localhost:8770/ux").rstrip("/")
LIMIT = float(os.environ.get("V2_MAX_DIFF", "0.002"))
OUT = ROOT / ".v2-compare" / "shell"
FIXED = "2026-11-25T14:33:00+05:30"
SEED = "let s=42;Math.random=()=>((s=(s*16807)%2147483647)/2147483647);"
STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
PROJECTS = {
    "desktop": {"viewport": {"width": 1440, "height": 900}},
    "mobile": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "user_agent": IPHONE_UA},
}
n = 0
failed = 0


def settle(page, ms=1500):
    for _ in range(ms // 500):
        page.clock.run_for(500)
        page.wait_for_timeout(10)


def open_page(browser, project, url):
    ctx = browser.new_context(device_scale_factor=1, reduced_motion="reduce", **PROJECTS[project])
    page = ctx.new_page()
    page.clock.install(time=FIXED)
    page.add_init_script(SEED + "try{if(!sessionStorage.getItem('v2c')){localStorage.clear();sessionStorage.setItem('v2c','1')}}catch(e){}")
    page.goto(url, wait_until="load")
    page.add_style_tag(content=STILL)
    settle(page, 20000)
    return page


def compare(label, ours, proto):
    global n, failed
    n += 1
    OUT.mkdir(parents=True, exist_ok=True)
    slug = f"{n:02d}-" + "".join(c if c.isalnum() else "-" for c in label.lower())[:48]
    a_path, b_path = OUT / f"{slug}.ours.png", OUT / f"{slug}.ref.png"
    settle(ours)
    settle(proto)
    ours.screenshot(path=str(a_path))
    proto.screenshot(path=str(b_path))
    a, b = Image.open(a_path).convert("RGB"), Image.open(b_path).convert("RGB")
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    ratio = sum(1 for v in d.getdata() if v) / (a.size[0] * a.size[1])
    side = Image.new("RGB", (a.width + b.width + 16, a.height), (255, 0, 255))
    side.paste(b, (0, 0))
    side.paste(a, (b.width + 16, 0))
    side.save(OUT / f"{slug}.side.png")
    ok = ratio <= LIMIT
    failed += 0 if ok else 1
    print(f"{'✓' if ok else '✗'} {n}. {label} — {ratio * 100:.2f}% differs")


def check(label, ok, detail=""):
    global n, failed
    n += 1
    failed += 0 if ok else 1
    print(f"{'✓' if ok else '✗'} {n}. {label}{' — ' + str(detail) if detail else ''}")


def both(pages, fn):
    for p in pages:
        fn(p)


with sync_playwright() as pw:
    browser = pw.chromium.launch()

    # ---------- desktop ----------
    ours = open_page(browser, "desktop", f"{APP}/lab/ask?s=empty")
    proto = open_page(browser, "desktop", f"{PROTO}/flows/ask/?s=empty&chrome=0")
    pages = (ours, proto)
    compare("empty chat", ours, proto)

    both(pages, lambda p: p.click("#rail"))
    compare("sidebar collapsed to the rail", ours, proto)
    check("the rail is remembered", ours.evaluate("localStorage.getItem('chat-rail')") == "1" and ours.evaluate("document.documentElement.classList.contains('rail')"))
    both(pages, lambda p: p.click("#rail"))
    compare("sidebar expanded again", ours, proto)

    both(pages, lambda p: p.click("#search"))
    compare("search open, all chats listed", ours, proto)
    check("search field has the caret", ours.evaluate("document.activeElement?.id") == "sq")
    both(pages, lambda p: p.fill("#sq", "crude"))
    compare("search filtered by a word in the title", ours, proto)
    both(pages, lambda p: p.fill("#sq", "neither high"))
    compare("search matches message text", ours, proto)
    both(pages, lambda p: p.fill("#sq", "zzz"))
    compare("search with no match", ours, proto)
    both(pages, lambda p: p.fill("#sq", ""))
    both(pages, lambda p: p.keyboard.press("ArrowDown"))
    compare("arrow down moves the highlight", ours, proto)
    both(pages, lambda p: p.keyboard.press("Escape"))
    compare("escape closes search", ours, proto)
    both(pages, lambda p: p.keyboard.press("Control+k"))
    check("Ctrl+K opens search", ours.evaluate("document.querySelector('#srch').classList.contains('on')"))
    both(pages, lambda p: p.mouse.click(5, 5))
    check("a click outside closes search", not ours.evaluate("document.querySelector('#srch').classList.contains('on')"))

    both(pages, lambda p: p.fill("#form0 .in", "Tell me when NIFTY crosses 25,000"))
    compare("typing a watcher sentence flips the chip to Watch and enables send", ours, proto)
    check("send is enabled with text", ours.evaluate("!document.querySelector('#form0 .send').disabled"))
    both(pages, lambda p: p.fill("#form0 .in", ""))
    compare("clearing the box disables send again", ours, proto)
    both(pages, lambda p: p.fill("#form0 .in", "line one\nline two\nline three\nline four"))
    compare("the box grows with the text", ours, proto)
    both(pages, lambda p: p.fill("#form0 .in", ""))

    both(pages, lambda p: p.hover("#sess .ss >> nth=1"))
    compare("hovering a chat shows its delete button", ours, proto)
    both(pages, lambda p: p.click("#sess .ss >> nth=1 >> .x"))
    compare("first click arms delete", ours, proto)
    both(pages, lambda p: p.click("#sess .ss >> nth=1 >> .x"))
    both(pages, lambda p: p.mouse.move(700, 100))
    compare("second click deletes the chat", ours, proto)
    check("two chats left", ours.locator("#sess .ss").count() == 2)

    both(pages, lambda p: p.hover("#sess .ss >> nth=0 >> .t"))
    compare("hover on a chat row", ours, proto)
    both(pages, lambda p: p.hover("#new"))
    compare("hover on New", ours, proto)
    both(pages, lambda p: p.hover("#ex button >> nth=0"))
    compare("hover on an example question", ours, proto)
    both(pages, lambda p: p.keyboard.press("Tab"))
    ours.context.close()
    proto.context.close()

    # ---------- phone ----------
    ours = open_page(browser, "mobile", f"{APP}/lab/ask?s=empty")
    proto = open_page(browser, "mobile", f"{PROTO}/flows/ask/?s=empty&chrome=0")
    pages = (ours, proto)
    compare("phone: empty chat", ours, proto)
    both(pages, lambda p: p.click("#menu"))
    compare("phone: the drawer opens over a scrim", ours, proto)
    both(pages, lambda p: p.click("#search"))
    compare("phone: search from the drawer closes the drawer", ours, proto)
    both(pages, lambda p: p.keyboard.press("Escape"))
    both(pages, lambda p: p.click("#menu"))
    both(pages, lambda p: p.mouse.click(370, 400))
    compare("phone: tapping the scrim closes the drawer", ours, proto)
    browser.close()

print(f"\n{n - failed}/{n} passed · images in {OUT}")
sys.exit(1 if failed else 0)
