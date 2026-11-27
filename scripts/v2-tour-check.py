"""V9 tour check (plan-v2-ui V9): twin interactions against the prototype, then the real /chat.

Part 1 — twin: the markets-hero prototype (`npm run serve`, :8770) and our lab page get
the SAME clicks and keys (Continue / Back / a market pick / Esc / a starter behind the
gate / help → Replay / a carried homepage question / Connect Kite on screen 3) and the
pixels are compared after each step, desktop and mobile, with the prototype suite's
frozen clock, seeded random and reduced motion. Images land in .v2-compare/tour-interactions/.

Part 2 — live: the dev server started with the fake Kite env (see scripts/ui-smoke.py)
against the local docker Postgres. The test account's onboarding row is reset with
`docker exec … psql`, then: first sign-in shows the tour → picks are saved by Not now
(GET /api/onboarding) → the gated chat shows the picked starters → a reload skips the
tour → help replays it → a homepage question is carried through the tour into the
saved-question card and the Connect Kite dialog → Connect Kite on screen 3 opens the
dialog. No question is sent (no MCP needed) and nothing is written to Kite.

  /usr/bin/python3 scripts/v2-tour-check.py            # both parts
  /usr/bin/python3 scripts/v2-tour-check.py --twin     # prototype twin only
  /usr/bin/python3 scripts/v2-tour-check.py --live     # real /chat only
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
PROTO = os.environ.get("MARKETS_HERO_URL", "http://localhost:8770/ux").rstrip("/")
LIMIT = float(os.environ.get("V2_MAX_DIFF", "0.002"))
OUT = ROOT / ".v2-compare" / "tour-interactions"
OUT.mkdir(parents=True, exist_ok=True)
FIXED = "2026-11-25T14:33:00+05:30"
SEED = ("let s=42;const __R=()=>((s=(s*16807)%2147483647)/2147483647);const __RAW=Math.random;"
        # Next/React dev internals draw a few randoms at module evaluation; they must not shift our seeded sequence.
        "Math.random=()=>{const c=(new Error().stack||'').split('\\n')[2]||'';return /_next_dist_|next-devtools/.test(c)?__RAW():__R()};")
STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
PROJECTS = {
    "desktop": {"viewport": {"width": 1440, "height": 900}},
    "mobile": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "user_agent": IPHONE_UA},
}
EMAIL = os.environ.get("DEV_LOGIN_EMAIL", "test@slash.markets")
CODE = os.environ.get("DEV_LOGIN_CODE", "123456")
PG = ["docker", "exec", os.environ.get("SMOKE_PG_CONTAINER", "slash-kite-eve-postgres"), "psql", "-U", "slashkite", "-d", "slash_kite_eve", "-At", "-v", "ON_ERROR_STOP=1", "-c"]
QUESTION = "Is TCS above its 200 DMA?"
n = 0


def check(label, ok, detail=""):
    global n
    n += 1
    print(f"{'✓' if ok else '✗'} {n}. {label}{' — ' + str(detail) if detail else ''}", flush=True)
    if not ok:
        print("FAILED")
        sys.exit(1)


def settle(page, ms=500):
    for _ in range(max(1, ms // 500)):
        page.clock.run_for(500)
        page.wait_for_timeout(10)


# ---------- part 1: the twin ----------

def twin(browser):
    for project, options in PROJECTS.items():
        errors = []

        def open_pair(lab_state, proto_state=None, lab_init="", proto_init=""):
            pages = []
            for base, path, init in (
                (APP, f"/lab/tour?s={lab_state}", lab_init),
                (PROTO, f"/flows/tour/?s={proto_state or lab_state}&chrome=0", proto_init),
            ):
                ctx = browser.new_context(device_scale_factor=1, reduced_motion="reduce", **options)
                page = ctx.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.clock.install(time=FIXED)
                page.add_init_script(SEED + "try{localStorage.clear()}catch(e){}" + init)
                page.goto(base + path, wait_until="load")
                page.add_style_tag(content=STILL)
                settle(page, 2000)
                pages.append(page)
            return pages

        def compare(label, ours, proto):
            for page in (ours, proto):
                settle(page)
            a_path, b_path = OUT / f"{project}-{n + 1}.ours.png", OUT / f"{project}-{n + 1}.ref.png"
            ours.screenshot(path=str(a_path))
            proto.screenshot(path=str(b_path))
            a, b = Image.open(a_path).convert("RGB"), Image.open(b_path).convert("RGB")
            if a.size != b.size:
                check(f"{project}: {label}", False, f"size {a.size} vs {b.size}")
            d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
            ratio = sum(1 for v in d.getdata() if v) / (a.width * a.height)
            side = Image.new("RGB", (a.width + b.width + 16, a.height), (255, 0, 255))
            side.paste(b, (0, 0))
            side.paste(a, (b.width + 16, 0))
            side.save(OUT / f"{project}-{n + 1}.side.png")
            check(f"{project}: {label} ({ratio * 100:.2f}% differs)", ratio <= LIMIT)

        def both(pages, fn):
            for page in pages:
                fn(page)
                settle(page)

        # new account: the three screens, a pick, keys
        ours, proto = pages = open_pair("new")
        compare("screen 1", ours, proto)
        both(pages, lambda p: p.click("#picks button >> nth=1"))
        check(f"{project}: Index picked, and the demo asks in that market at once",
              all("NIFTY BANK" in p.locator("#qs .qi").last.text_content() for p in pages))
        compare("after picking Index", ours, proto)
        both(pages, lambda p: p.click("#picks button >> nth=1"))
        # The clock stamps differ by the React page's hydration offset (~1 s); the questions must not.
        bubbles = [[re.sub(r" · \d\d:\d\d:\d\d$", "", t) for t in p.locator("#qs .qi").all_text_contents()] for p in pages]
        check(f"{project}: unpicking does not restart the demo (both show the same bubbles)", bubbles[0] == bubbles[1], bubbles)
        compare("after unpicking Index", ours, proto)
        both(pages, lambda p: p.click("#nx"))
        compare("screen 2 (Continue)", ours, proto)
        both(pages, lambda p: p.click("#cbtn"))
        compare("Code toggled off", ours, proto)
        both(pages, lambda p: p.keyboard.press("ArrowRight"))
        check(f"{project}: → reaches screen 3 with Connect Kite", all(p.locator("#nx").text_content() == "Connect Kite" for p in pages))
        compare("screen 3 (→)", ours, proto)
        both(pages, lambda p: p.keyboard.press("ArrowLeft"))
        compare("screen 2 (←)", ours, proto)
        both(pages, lambda p: p.click("#bk"))
        compare("screen 1 (Back)", ours, proto)
        both(pages, lambda p: p.keyboard.press("Escape"))
        settle(ours, 2000)
        settle(proto, 2000)
        check(f"{project}: Esc skips into the gated chat", all(p.evaluate("document.documentElement.dataset.state") == "after" for p in pages))
        compare("after Esc: the gated chat", ours, proto)
        both(pages, lambda p: p.click("#ex button >> nth=1"))
        check(f"{project}: a starter behind the gate is saved", all("Reliance" in p.locator("#waitq .qcard").text_content() for p in pages))
        check(f"{project}: …and toasts", all("Saved. It runs once Kite connects." in p.locator(".toast2, #toast2").first.text_content() for p in pages))
        compare("starter saved behind the gate", ours, proto)
        settle(ours, 4000)
        settle(proto, 4000)
        both(pages, lambda p: p.click("#help"))
        compare("help open", ours, proto)
        both(pages, lambda p: p.click("#helpp .rp, #tour-help-panel .rp"))
        settle(ours, 1000)
        settle(proto, 1000)
        check(f"{project}: Replay the intro reopens the tour with the saved question",
              all(p.locator("#onb .qcard").count() == 1 for p in pages))
        compare("replayed intro, question kept", ours, proto)
        for p in pages:
            p.context.close()

        # with a carried homepage question: the card on every screen, Not now → queued
        ours, proto = pages = open_pair(
            "q",
            lab_init=f"try{{sessionStorage.setItem('slash-home-lab:queued-question',{json.dumps(QUESTION)})}}catch(e){{}}",
            proto_init=f"try{{sessionStorage.setItem('ux-onboarding-question',JSON.stringify({{prompt:{json.dumps(QUESTION)},ready:false}}))}}catch(e){{}}",
        )
        check(f"{project}: the homepage question is carried into the tour",
              all(QUESTION in p.locator("#obmain .qcard").text_content() and "TCS" in p.locator("#obmain .tick").text_content() for p in pages),
              [p.locator("#obmain .qcard").text_content() for p in pages])
        compare("q: screen 1 with the question", ours, proto)
        both(pages, lambda p: p.click("#nx"))
        both(pages, lambda p: p.click("#nx"))
        check(f"{project}: the question stays on screen 3", all(QUESTION in p.locator("#obmain .qcard").text_content() for p in pages))
        compare("q: screen 3", ours, proto)
        both(pages, lambda p: p.click("#nn"))
        settle(ours, 2000)
        settle(proto, 2000)
        check(f"{project}: Not now → queued, the question saved for later",
              all(p.evaluate("document.documentElement.dataset.state") == "queued" and "queued" in p.url and QUESTION in p.locator("#waitq .qcard").text_content() for p in pages))
        check(f"{project}: no starters while a question is queued", all(p.locator("#ex button").count() == 0 for p in pages))
        compare("queued", ours, proto)
        for p in pages:
            p.context.close()

        # Connect Kite on screen 3 exits to connect-kite with the question
        ours, proto = pages = open_pair("q")
        both(pages, lambda p: p.keyboard.press("Enter"))
        both(pages, lambda p: p.keyboard.press("Enter"))
        both(pages, lambda p: p.keyboard.press("Enter"))
        ours.wait_for_url("**/lab/connect-kite?s=connect", timeout=10_000)
        proto.wait_for_url("**/flows/connect-kite/?s=connect**", timeout=10_000)
        for p in pages:
            p.wait_for_selector("#ks .qcard", timeout=10_000)
        check(f"{project}: Enter ×3 exits to Connect Kite with the question", all("Reliance" in p.locator("#ks .qcard").text_content() for p in pages))
        for p in pages:
            p.context.close()
        check(f"{project}: no page errors", not errors, errors)


# ---------- part 2: live ----------

def api(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(f"{APP}{path}", method=method, headers=headers, data=data)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


def sql(q):
    return subprocess.run(PG + [q], check=True, capture_output=True, text=True).stdout.strip()


def live(browser):
    login = api("POST", "/api/auth/verify-otp", None, {"email": EMAIL, "code": CODE})
    token, user = login["token"], login["user"]
    if api("GET", "/api/broker", token)["status"] in ("active", "token_expired"):
        api("DELETE", "/api/broker", token)

    def reset_tour():
        sql(f"insert into eve.onboarding (user_id, markets, completed_at) values ('{user['id']}', '{{}}', null) "
            "on conflict (user_id) do update set markets = '{}', completed_at = null")
        check("onboarding reset to pending", api("GET", "/api/onboarding", token) == {"pending": True, "markets": []})

    def open_chat(page, question=""):
        page.goto(f"{APP}/terms")
        page.evaluate(
            "([t,u,q])=>{localStorage.setItem('slash_kite.token',t);localStorage.setItem('slash_kite.user',JSON.stringify(u));"
            "sessionStorage.clear();if(q)sessionStorage.setItem('slash-home:queued-question',q)}",
            [token, user, question],
        )
        page.goto(f"{APP}/chat")

    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    reset_tour()
    open_chat(page)
    page.wait_for_selector("#onb.on", timeout=30_000)
    check("first sign-in opens the tour on screen 1", page.locator("#onb h1").text_content() == "Ask in your own words" and page.locator("#segs i.on").count() == 1)
    check("the app behind is inert", page.locator("#app").get_attribute("data-auth") == "delayed" and page.evaluate("document.querySelector('#onb').closest('[inert]')===null && !!document.querySelector('#app')?.closest('[inert]')"))
    page.click("#picks button >> nth=2")  # F&O
    page.wait_for_function("document.querySelector('#qs .qi')?.textContent.includes('NIFTY 25800 CE')", timeout=10_000)
    check("picking F&O makes the demo ask in that market", True)
    page.click("#nx")
    page.wait_for_selector("#stage.s1")
    check("screen 2 shows the run demo", "Get the answer" in page.locator("#onb h1").text_content())
    page.click("#nx")
    page.wait_for_selector("#stage.s2")
    check("screen 3 offers Connect Kite and Not now", page.locator("#nx").text_content() == "Connect Kite" and page.locator("#nn").count() == 1)
    page.click("#nn")
    page.wait_for_selector("#onb", state="detached", timeout=10_000)
    page.wait_for_function("document.querySelector('.tour-launch')===null", timeout=10_000)
    check("Not now launches the gated chat", page.locator("#nbb").text_content().strip() == "Connect Kite" and page.locator("#form0 .in").get_attribute("readonly") is not None)
    chips = page.locator("#ex button").all_text_contents()
    check("starters: Surprise me, then the picked market's question", chips[0].startswith("Surprise me") and chips[1].startswith("Nifty 25,800 CE"), chips)
    state = api("GET", "/api/onboarding", token)
    check("the picks are saved and the tour is done", state == {"pending": False, "markets": ["fo"]}, state)

    page.reload()
    page.wait_for_function("document.querySelector('#app')?.dataset.auth==='delayed'", timeout=30_000)
    page.wait_for_timeout(1500)
    check("a reload skips the tour", page.locator("#onb").count() == 0)
    check("…and still shows the picked starters", page.locator("#ex button").all_text_contents()[1].startswith("Nifty 25,800 CE"))
    page.click("#help")
    page.click("#tour-help-panel .rp")
    page.wait_for_selector("#onb.on", timeout=10_000)
    check("help → Replay the intro reopens the tour", page.locator("#picks button.on").count() == 1)
    page.keyboard.press("Escape")
    page.wait_for_selector("#onb", state="detached", timeout=10_000)
    check("Esc closes the replay without changing the saved picks", api("GET", "/api/onboarding", token)["markets"] == ["fo"])

    # a homepage question is carried through the tour (new account with a question)
    reset_tour()
    open_chat(page, QUESTION)
    page.wait_for_selector("#onb.on", timeout=30_000)
    check("a new account's homepage question shows on the tour", QUESTION in page.locator("#obmain .qcard").text_content())
    page.click("#nx")
    page.click("#nx")
    check("…on every screen, with the Kite line for a question", QUESTION in page.locator("#obmain .qcard").text_content() and "your question runs first" in page.locator("#obmain .gate").text_content())
    page.click("#nn")
    page.wait_for_selector("#onb", state="detached", timeout=10_000)
    page.wait_for_selector("#waitq.on .qcard", timeout=10_000)
    check("Not now keeps the question saved for later", QUESTION in page.locator("#waitq .qcard").text_content() and page.locator("#ex button").count() == 0)
    page.click("#nbb")
    page.wait_for_selector("#kv.is-on", timeout=10_000)
    check("the gate banner opens Connect Kite with the saved question", QUESTION in page.locator("#kv .qcard").text_content())
    page.keyboard.press("Escape")
    page.wait_for_function("!document.querySelector('#kv').classList.contains('is-on')", timeout=10_000)
    check("Esc closes the dialog; the question stays saved", QUESTION in page.locator("#waitq .qcard").text_content())

    # Connect Kite from screen 3 opens the dialog straight away
    reset_tour()
    open_chat(page, QUESTION)
    page.wait_for_selector("#onb.on", timeout=30_000)
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    page.keyboard.press("Enter")
    page.wait_for_selector("#kv.is-on", timeout=15_000)
    page.wait_for_selector("#onb", state="detached", timeout=10_000)
    check("Connect Kite on screen 3 saves the picks and opens the dialog with the question",
          api("GET", "/api/onboarding", token)["pending"] is False and QUESTION in page.locator("#kv .qcard").text_content())
    check("no page errors", not errors, errors)
    ctx.close()


if __name__ == "__main__":
    want_twin = "--live" not in sys.argv
    want_live = "--twin" not in sys.argv
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        if want_twin:
            twin(browser)
        if want_live:
            live(browser)
        browser.close()
    print(f"\n{n} checks passed")
