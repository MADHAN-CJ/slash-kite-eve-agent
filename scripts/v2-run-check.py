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
OUT = ROOT / ".v2-compare" / "run"
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


MAIN = (278, 48, 1120, 900)  # the thread column: the side panel's code differs by design (real scripts)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ours = open_page(browser, f"{APP}/lab/ask?s=answer")
    proto = open_page(browser, f"{PROTO}/flows/ask/?s=answer&chrome=0")
    both = lambda fn: (fn(ours), fn(proto))

    both(lambda p: p.evaluate("document.querySelector('#scroll').scrollTop=0"))
    compare("answer, scrolled to the top (thread column)", ours, proto, MAIN)
    both(lambda p: p.click(".th6c"))
    compare("plan unfolds", ours, proto, MAIN)
    check("plan lists the real steps", ours.locator(".pl6 li.is-ok").count() == 2 and "python · RELIANCE 1D · 60 candles · 142 ms" in ours.locator(".pl6 li small").first.text_content())
    both(lambda p: p.click(".th6c"))
    both(lambda p: p.click('.tb5 [data-t5="code"]'))
    check("Code tab shows the scripts with their headers", "# [1] Price history · 142 ms" in ours.locator(".co5 pre").text_content() and ours.locator(".co5 pre").is_visible())
    compare("Code tab (thread column)", ours, proto, MAIN)
    both(lambda p: p.click('.tb5 [data-t5="answer"]'))
    both(lambda p: p.click(".sf5 > summary"))
    compare("Sources card open with the receipt", ours, proto, MAIN)
    check("receipt reads the real totals", "61 rows" in ours.locator(".sf5 .rc").text_content() and "14:32:05" in ours.locator(".sf5 .rc").text_content())
    both(lambda p: p.click(".sf5 > summary"))
    both(lambda p: p.click('.m5[data-n="2"]'))
    check("a source mark opens the card on that source", ours.evaluate("document.querySelector('.sf5').open") and ours.evaluate("document.querySelector('.sf5-source[data-n=\"2\"]').open"))
    compare("mark 2 opened source 2", ours, proto, MAIN)
    both(lambda p: p.click(".sf5 .rc button"))
    check("the receipt's Code button switches to the Code tab", ours.evaluate("document.querySelector('.msg.a').dataset.t5") == "code")
    both(lambda p: p.click('.tb5 [data-t5="answer"]'))
    both(lambda p: p.click(".sf5 > summary"))
    both(lambda p: p.hover(".fu button >> nth=0"))
    compare("hover on a follow-up chip", ours, proto, MAIN)
    both(lambda p: p.hover('[data-f5="watch"]'))
    compare("hover on Watch this", ours, proto, MAIN)
    both(lambda p: p.click('[data-a="copy"]'))
    check("copy shows a tick", ours.locator('[data-a="copy"]').text_content().strip() == "✓")
    ours.context.close()
    proto.context.close()

    # the run in flight: stop with Esc
    ours = open_page(browser, f"{APP}/lab/ask?s=run")
    proto = open_page(browser, f"{PROTO}/flows/ask/?s=run&chrome=0")
    both = lambda fn: (fn(ours), fn(proto))
    check("esc hint shows while running (hover devices)", ours.locator("#form1 .esc5").is_visible())
    both(lambda p: p.keyboard.press("Escape"))
    settle(ours, 1000)
    settle(proto, 1000)
    check("Esc stops the run: status line, dashed step, footer", ours.locator(".msg.a .st").text_content() == "Stopped" and ours.locator(".pl6 li.is-stop").count() >= 1 and "Nothing more was run" in ours.locator(".so5").text_content())
    compare("stopped with Esc (thread column)", ours, proto, MAIN)
    both(lambda p: p.click(".so5 button"))
    settle(ours, 6000)
    settle(proto, 6000)
    check("Ask again runs the question once more", ours.locator(".msg.u").count() == 1 and ours.locator(".msg.a").count() == 1 and "Step" in ours.locator(".msg.a .st").text_content() or "Writing" in ours.locator(".msg.a .st").text_content() or "Ran" in ours.locator(".msg.a .st").text_content())
    browser.close()

print(f"\n{n - failed}/{n} passed · images in {OUT}")
sys.exit(1 if failed else 0)
