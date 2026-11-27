"""V10 limits check (plan-v2-ui V10): the lab against the prototype, then the real rules.

Part 1 — twin: for `low`, `out`, `long` and `full` the lab and the prototype (`npm run serve`,
:8770) are opened with the prototype suite's frozen clock / seed / reduced motion and the
DOCK is compared element by element (#lim5, the card or note, #form1, the credits line,
the app's limit classes) — the thread above it is the pre-existing `ask:answer` fast-replay
(the prototype shows its Chart tab / side panel there, our open "Sources card vs side panel"
question) and the prototype does not re-stick the thread when the dock grows, so whole-page
pixels are not the measure here. Then the same clicks on both: Start a new chat (long),
Start a new chat → carry card → ✕ (full), See plans / Wait (out), with pixel compares of the
resulting hero states. Images in .v2-compare/limits/.

Part 2 — live: the dev server (any Kite env) against the local docker Postgres. Rows are
seeded for the test account with `docker exec … psql`: a thread with 20 and then 40 user
turns (long / full by turns), and an assistant turn whose stored cost equals the monthly
allowance (credits out). Checks: GET /api/threads/:id reports `limit`/`carry`, the UI shows
the note / card / credits card, the carry card appears on the new chat, and the proxy
refuses turns with 409 CHAT_FULL / 402 CREDITS_OUT. Seeded rows are removed at the end.

  /usr/bin/python3 scripts/v2-limits-check.py            # both
  /usr/bin/python3 scripts/v2-limits-check.py --twin
  /usr/bin/python3 scripts/v2-limits-check.py --live
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
PROTO = os.environ.get("MARKETS_HERO_URL", "http://localhost:8770/ux").rstrip("/")
LIMIT = float(os.environ.get("V2_MAX_DIFF", "0.002"))
OUT = ROOT / ".v2-compare" / "limits"
OUT.mkdir(parents=True, exist_ok=True)
FIXED = "2026-11-25T14:33:00+05:30"
SEED = ("let s=42;const __R=()=>((s=(s*16807)%2147483647)/2147483647);const __RAW=Math.random;"
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
n = 0

DOCK_JS = """() => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.y), Math.round(r.height), Math.round(r.width)]; };
  const text = (s) => document.querySelector(s)?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
  const app = document.querySelector('#app').className.split(' ').filter((c) => /^(cr-low|cr-out|lim-card|lim-lock)$/.test(c)).sort();
  return {
    app, lim5: box('#lim5'), lim5On: document.querySelector('#lim5').classList.contains('is-on'),
    card: box('#lim5 .lc5'), note: box('#lim5 .ln5'), cardText: text('#lim5 .lc5') ?? text('#lim5 .ln5'),
    buttons: [...document.querySelectorAll('#lim5 button')].map((b) => b.textContent.trim()),
    form1: box('#form1'), form1Disabled: document.querySelector('#form1 .in')?.disabled ?? null,
    credits: text('.dock-wrap .cr5t'), creditsFill: getComputedStyle(document.querySelector('.dock-wrap .cr5b i')).width,
    creditsColor: getComputedStyle(document.querySelector('.dock-wrap .cr5t')).color,
  };
}"""


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


def twin(browser):
    for project, options in PROJECTS.items():
        errors = []

        def open_pair(state):
            pages = []
            for base, path in ((APP, f"/lab/ask?s={state}"), (PROTO, f"/flows/ask/?s={state}&chrome=0")):
                ctx = browser.new_context(device_scale_factor=1, reduced_motion="reduce", **options)
                page = ctx.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.clock.install(time=FIXED)
                page.add_init_script(SEED + "try{localStorage.clear()}catch(e){}")
                page.goto(base + path, wait_until="load")
                page.add_style_tag(content=STILL)
                settle(page, 20000)
                pages.append(page)
            return pages

        def compare(label, ours, proto):
            for page in (ours, proto):
                settle(page)
            a_path, b_path = OUT / f"{project}-{n + 1}.ours.png", OUT / f"{project}-{n + 1}.ref.png"
            ours.screenshot(path=str(a_path))
            proto.screenshot(path=str(b_path))
            a, b = Image.open(a_path).convert("RGB"), Image.open(b_path).convert("RGB")
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

        for state in ("low", "out", "long", "full"):
            ours, proto = pages = open_pair(state)
            docks = [p.evaluate(DOCK_JS) for p in pages]
            check(f"{project}: {state} — the dock matches the prototype element by element", docks[0] == docks[1], docks if docks[0] != docks[1] else docks[0]["cardText"] or docks[0]["credits"])
            if state == "long":
                both(pages, lambda p: p.click("#lim5 [data-l=new]"))
                check(f"{project}: long — Start a new chat opens an empty chat", all(p.locator("#app.empty").count() == 1 and not p.locator("#lim5").evaluate("e=>e.classList.contains('is-on')") for p in pages))
                compare("long → new chat", ours, proto)
            if state == "full":
                check(f"{project}: full — the docked box is disabled and hidden", all(p.locator("#form1 .in").is_disabled() and p.locator("#form1").evaluate("e=>getComputedStyle(e).display") == "none" for p in pages))
                both(pages, lambda p: p.click("#lim5 [data-l=carry]"))
                check(f"{project}: full — Start a new chat carries the summary above the box", all(p.locator("#cy5.is-on").count() == 1 and "2,912" in p.locator("#cy5").text_content() for p in pages))
                compare("full → new chat with the carry card", ours, proto)
                both(pages, lambda p: p.click("#cy5 button"))
                check(f"{project}: full — ✕ removes the carry card", all(p.locator("#cy5.is-on").count() == 0 for p in pages))
                compare("carry card removed", ours, proto)
            if state == "out":
                both(pages, lambda p: p.click("#lim5 [data-l=plans]"))
                check(f"{project}: out — See plans toasts", all("Plans open in your account." in p.locator("#toast2").text_content() for p in pages))
                settle(ours, 4000)
                settle(proto, 4000)
                both(pages, lambda p: p.click("#lim5 [data-l=wait]"))
                check(f"{project}: out — Wait toasts and the card stays", all("Your chats stay open to read." in p.locator("#toast2").text_content() and p.locator("#lim5 .lc5").count() == 1 for p in pages))
            for p in pages:
                p.context.close()
        check(f"{project}: no page errors", not errors, errors)


# ---------- live ----------

def api(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(f"{APP}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def sql(q):
    return subprocess.run(PG + [q], check=True, capture_output=True, text=True).stdout.strip()


SESSION = "wrun_V10LIMITCHECK"


def seed_thread(user_id, turns, title):
    sql(f"delete from eve.threads where eve_session_id = '{SESSION}'")
    tid = sql(f"insert into eve.threads (eve_session_id, user_id, title, continuation_token) values ('{SESSION}', '{user_id}', '{title}', 'tok') returning id").splitlines()[0]
    rows = []
    for i in range(1, turns + 1):
        rows.append(f"('{tid}', {i}, 'user', 'Question {i} about RELIANCE', '[]'::jsonb)")
        rows.append(f"('{tid}', {i}, 'assistant', 'Answer {i}: support at 2,912 and 2,861, resistance at 2,984.', '[]'::jsonb)")
    sql(f"insert into eve.messages (thread_id, turn_sequence, role, content, parts) values {', '.join(rows)}")
    return tid


def live(browser):
    status, login = api("POST", "/api/auth/verify-otp", None, {"email": EMAIL, "code": CODE})
    check("dev login", status == 200, status)
    token, user = login["token"], login["user"]
    status, usage = api("GET", "/api/usage", token)
    check("usage reports the low threshold", status == 200 and isinstance(usage.get("lowPct"), int), usage)
    allowance = usage["allowanceUsd"]

    def open_chat(page):
        page.goto(f"{APP}/terms")
        page.evaluate("([t,u])=>{localStorage.setItem('slash_kite.token',t);localStorage.setItem('slash_kite.user',JSON.stringify(u));sessionStorage.clear()}", [token, user])
        page.goto(f"{APP}/chat")
        page.wait_for_function("!!document.querySelector('#app')?.dataset.auth", timeout=30_000)

    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    try:
        # long by turns
        tid = seed_thread(user["id"], 20, "RELIANCE levels this week")
        status, detail = api("GET", f"/api/threads/{tid}", token)
        check("20 turns → the thread is long", status == 200 and detail["limit"] == "long" and detail["carry"] == "", (status, detail.get("limit")))
        open_chat(page)
        page.click("#sess button:has-text('RELIANCE levels this week')")
        page.wait_for_selector("#lim5.is-on .ln5", timeout=15_000)
        check("the long note shows above the box, the box stays usable", "getting long" in page.locator("#lim5 .ln5").text_content() and not page.locator("#form1 .in").is_disabled())
        page.click("#lim5 [data-l=new]")
        page.wait_for_selector("#app.empty", timeout=10_000)
        check("Start a new chat opens a fresh chat without the note", page.locator("#lim5.is-on").count() == 0)

        # full by turns
        tid = seed_thread(user["id"], 40, "RELIANCE levels this week")
        status, detail = api("GET", f"/api/threads/{tid}", token)
        check("40 turns → the thread is full, with a carry-over summary", status == 200 and detail["limit"] == "full" and detail["carry"].startswith("RELIANCE levels this week: Answer 40"), (status, detail.get("limit"), detail.get("carry")))
        status, body = api("POST", f"/api/eve/v1/session/{SESSION}", token, {"message": "one more?"})
        check("the proxy refuses a turn on a full chat (409 CHAT_FULL)", status == 409 and body.get("code") == "CHAT_FULL", (status, body))
        status, body = api("POST", f"/api/eve/v1/session/{SESSION}", token, {"inputResponses": []})
        check("…but approval replies are not credit/limit gated at the proxy", status != 409 or body.get("code") != "CHAT_FULL", (status, body))
        page.reload()
        page.wait_for_function("!!document.querySelector('#app')?.dataset.auth", timeout=30_000)
        page.click("#sess button:has-text('RELIANCE levels this week')")
        page.wait_for_selector("#lim5.is-on .lc5", timeout=15_000)
        check("the full card replaces the box and shows what carries over", "This chat is full." in page.locator("#lim5 .lc5").text_content() and "Answer 40" in page.locator("#lim5 .sm5").text_content() and page.locator("#form1").evaluate("e=>getComputedStyle(e).display") == "none")
        page.click("#lim5 [data-l=carry]")
        page.wait_for_selector("#cy5.is-on", timeout=10_000)
        check("Start a new chat shows the carried summary above the hero box", "Answer 40" in page.locator("#cy5").text_content() and page.locator("#app.empty").count() == 1)
        page.click("#cy5 button")
        check("✕ removes it", page.locator("#cy5").count() == 0)

        # credits out: one assistant turn that cost the whole allowance
        sql(f"update eve.messages set cost = '{{\"currency\":\"USD\",\"model\":\"check\",\"total\":{allowance},\"breakdown\":{{\"input\":{allowance},\"output\":0,\"cacheRead\":0,\"cacheWrite\":0}}}}'::jsonb "
            f"where thread_id = '{tid}' and role = 'assistant' and turn_sequence = 1")
        status, usage = api("GET", "/api/usage", token)
        check("usage shows no credits left", status == 200 and usage["leftPct"] == 0, usage)
        status, body = api("POST", "/api/eve/v1/session", token, {"message": "anything"})
        check("the proxy refuses a new chat without credits (402 CREDITS_OUT)", status == 402 and body.get("code") == "CREDITS_OUT" and body.get("resetsOn") == usage["resetsOn"], (status, body))
        page.reload()
        page.wait_for_selector("#app.cr-out", timeout=30_000)
        check("the credits bar is empty and the hero shows the credits card", "No credits left this month" in page.locator(".hero .cr5t").text_content())
        page.click("#sess button:has-text('RELIANCE levels this week')")
        page.wait_for_selector("#lim5.is-on .lc5", timeout=15_000)
        card = page.locator("#lim5 .lc5").text_content()
        check("in a chat the credits card replaces the box, naming the renewal day", "used this month’s credits" in card and "come back on" in card and page.locator("#form1").evaluate("e=>getComputedStyle(e).display") == "none", card)
        page.click("#lim5 [data-l=plans]")
        page.wait_for_selector("#pf8", timeout=10_000)
        check("See plans opens the account panel", True)
        check("no page errors", not errors, errors)
    finally:
        sql(f"delete from eve.threads where eve_session_id = '{SESSION}'")
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
