"""Twin check for the v2 run (plan-v2-ui V3): the same interactions on the
prototype's `ask` answer and on our lab replay, pixels compared after each.
Needs `npm run dev` here and `npm run serve` in markets-hero.

  /usr/bin/python3 scripts/v2-run-check.py
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
OUT = ROOT / ".v2-compare" / "watch"
FIXED = "2026-11-25T14:33:00+05:30"
SEED = "let s=42;Math.random=()=>((s=(s*16807)%2147483647)/2147483647);"
STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}"
n = failed = 0


def settle(page, ms=1500):
    for _ in range(ms // 500):
        page.clock.run_for(500)
        page.wait_for_timeout(10)


def open_page(browser, url):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, reduced_motion="reduce", permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.clock.install(time=FIXED)
    page.add_init_script(SEED + "try{localStorage.clear()}catch(e){}")
    page.goto(url, wait_until="load")
    page.add_style_tag(content=STILL)
    settle(page, 20000)
    return page


def compare(label, ours, proto, box=None):
    global n, failed
    n += 1
    OUT.mkdir(parents=True, exist_ok=True)
    slug = f"{n:02d}-" + "".join(c if c.isalnum() else "-" for c in label.lower())[:48]
    settle(ours)
    settle(proto)
    a_path, b_path = OUT / f"{slug}.ours.png", OUT / f"{slug}.ref.png"
    ours.screenshot(path=str(a_path))
    proto.screenshot(path=str(b_path))
    a, b = Image.open(a_path).convert("RGB"), Image.open(b_path).convert("RGB")
    if box:
        a, b = a.crop(box), b.crop(box)
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


MAIN = (278, 48, 1120, 900)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ours = open_page(browser, f"{APP}/lab/ask?s=answer")
    proto = open_page(browser, f"{PROTO}/flows/ask/?s=answer&chrome=0")
    both = lambda fn: (fn(ours), fn(proto))

    both(lambda p: p.click('[data-f5="watch"]'))
    compare("Watch this: the panel above the box, the prompt written with the level selected", ours, proto, MAIN)
    check("prompt prefilled with the support level", ours.locator("#form1 .in").input_value() == "Tell me when RELIANCE closes below 2,912 on the 15-min chart")
    check("the level is selected for editing", ours.evaluate("(()=>{const t=document.querySelector('#form1 .in');return t.value.slice(t.selectionStart,t.selectionEnd)})()") == "2,912")
    check("three levels and Something else", ours.locator(".wq5c button").count() == 4 and ours.locator(".wq5c button.is-on").count() == 1)
    both(lambda p: p.click(".wq5c button >> nth=0"))
    compare("picking the resistance rewrites the prompt", ours, proto, MAIN)
    check("resistance prompt", ours.locator("#form1 .in").input_value() == "Tell me when RELIANCE closes above 2,984 on the 15-min chart")
    both(lambda p: p.click(".wq5c button >> nth=1"))
    both(lambda p: p.keyboard.press("Enter"))
    settle(ours, 12000)
    settle(proto, 12000)
    check("sending closes the panel", ours.locator("#wq5").count() == 0)
    check("the confirm card shows before anything starts", ours.locator(".wc5 .wt5").text_content() == "New watcher" and ours.locator('.wc5 [data-w="start"]').count() == 1)
    check("the plan ends on 'Show you the watcher before it starts'", "Show you the watcher before it starts" in ours.locator(".msg.a").last.locator(".pl6").inner_html())
    check("Watch this is not offered under a watcher answer", ours.locator(".msg.a").last.locator('[data-f5="watch"]').count() == 0)
    compare("the confirm card (thread column)", ours, proto, MAIN)
    both(lambda p: p.click('.wc5 [data-w="code"]'))
    compare("See the script opens the script", ours, proto, MAIN)
    check("See the script toggles to Hide", ours.locator('.wc5 [data-w="code"]').text_content() == "Hide the script")
    both(lambda p: p.click('.wc5 [data-w="code"]'))
    both(lambda p: p.click('.wc5 [data-w="start"]'))
    settle(ours, 1000)
    settle(proto, 1000)
    check("Start watching turns the card live with Open Watchers", ours.locator(".wc5.is-live .wt5").text_content() == "Watching" and ours.locator(".wc5 .pr5").text_content() == "Open Watchers")
    check("a toast confirms it keeps running", "keeps running" in ours.locator("#toast2").text_content())
    compare("the live card (thread column)", ours, proto, MAIN)
    browser.close()

print(f"\n{n - failed}/{n} passed · images in {OUT}")
sys.exit(1 if failed else 0)
