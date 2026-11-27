"""Live check of the v2 Watchers screen and the watcher confirm card (plan-v2-ui V5)
on the local stack: docker Postgres + `npm run dev:mcp` + `npm run dev` started with
the fake Kite env (see scripts/ui-smoke.py). Hosts the fake Zerodha on :4999.

  1. a watcher seeded in the MCP's table (with an alert and a link to a chat) shows on
     the Watchers screen; pause → resume → Open in chat → cancel go through the real API;
  2. a REAL model turn asked to create a watcher stops at the confirm card (eve approval
     on create_watcher, this app only) — nothing exists until Start watching; after Start
     the MCP creates it, the chat is linked (eve.watcher_links) and the Watchers screen
     shows it with Open in chat back to that chat.

  /usr/bin/python3 scripts/v2-watchers-check.py
"""
import json
import os
import subprocess
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.environ.get("DEV_LOGIN_EMAIL", "test@slash.markets")
CODE = os.environ.get("DEV_LOGIN_CODE", "123456")
PG = ["docker", "exec", "slash-kite-eve-postgres", "psql", "-U", "slashkite", "-d", "slash_kite_eve", "-At", "-v", "ON_ERROR_STOP=1", "-c"]
n = 0


def check(label, ok, detail=""):
    global n
    n += 1
    print(f"{'✓' if ok else '✗'} {n}. {label}{' — ' + str(detail) if detail else ''}")
    if not ok:
        print("FAILED")
        cleanup()
        sys.exit(1)


def sql(q):
    return subprocess.run(PG + [q], check=True, capture_output=True, text=True).stdout.strip()


class FakeKite(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/connect/login":
            state = parse_qs(parse_qs(u.query).get("redirect_params", [""])[0]).get("state", [""])[0]
            self.send_response(302)
            self.send_header("Location", f"{APP}/api/broker/kite/callback?status=success&request_token=RT-v5&state={state}")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length", 0)))
        raw = json.dumps({"status": "success", "data": {"user_id": "AB1234", "user_name": "Smoke Trader", "access_token": "kite-smoke-token"}}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_DELETE(self):
        raw = b'{"status":"success","data":true}'
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


server = HTTPServer(("127.0.0.1", 4999), FakeKite)
threading.Thread(target=server.serve_forever, daemon=True).start()


def api(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(f"{APP}{path}", method=method, headers=headers, data=data)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


login = api("POST", "/api/auth/verify-otp", None, {"email": EMAIL, "code": CODE})
token, uid = login["token"], login["user"]["id"]
THREAD = "00000000-0000-4000-8000-00000000v5c1".replace("v5c1", "05c1")


created = []


def cleanup():
    for w in created:
        if w:
            sql(f"DELETE FROM watchers WHERE id = '{w}'")
    sql(f"DELETE FROM watchers WHERE user_id = '{uid}' AND (id LIKE 'v5check-%' OR label LIKE 'v5check %')")
    sql(f"DELETE FROM eve.threads WHERE id = '{THREAD}'")


cleanup()
start = api("POST", "/api/broker/kite/login/start", token)
urllib.request.urlopen(urllib.request.Request(start["loginUrl"]))
check("fake Zerodha session active", api("GET", "/api/broker", token)["status"] == "active")

# 1. a seeded watcher, an alert, and the chat it came from
sql(f"INSERT INTO eve.threads (id, eve_session_id, user_id, title) VALUES ('{THREAD}', 'wrun_V5CHECK0001', '{uid}', 'GOLDBEES levels this week')")
sql(
    "INSERT INTO watchers (id, user_id, symbol, label, script, market, check_every_s, status, baseline_done, last_met, last_value, "
    f"last_checked_at, last_fired_at, fired_count, expires_at) VALUES ('v5check-gold', '{uid}', 'NSE:GOLDBEES', 'Price drops below 100', "
    "'print(1)', 'NSE', 60, 'ARMED', true, true, '99.82', now() - interval '1 minute', now() - interval '20 minutes', 1, now() + interval '20 days')"
)
sql("INSERT INTO watcher_fires (id, watcher_id, fired_at, value, detail, emailed) VALUES ('v5check-f1', 'v5check-gold', now() - interval '20 minutes', '99.94', 'Dropped below 100.00', true)")
sql(f"INSERT INTO eve.watcher_links (watcher_id, user_id, thread_id) VALUES ('v5check-gold', '{uid}', '{THREAD}')")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{APP}/terms")
    page.evaluate("([t,u])=>{localStorage.setItem('slash_kite.token',t);localStorage.setItem('slash_kite.user',JSON.stringify(u))}", [token, login["user"]])
    page.goto(f"{APP}/chat")
    page.wait_for_function("document.querySelector('#app')?.dataset.auth==='kite'", timeout=30_000)
    page.click("#navalerts")
    card = page.locator('.ls8 [data-pick="v5check-gold"]')
    card.wait_for(timeout=15_000)
    card.click()
    pn = page.locator('.pn8[data-id="v5check-gold"]')
    check("Watchers lists the seeded watcher; the panel shows True now and the value", "True now" in pn.locator(".s8").text_content() and pn.locator(".n8 b").text_content() == "99.82")
    check("the gap to the level is read from the rule", "0.18 below your level" in pn.locator(".n8 span").text_content())
    check("the alert log shows the email that went out", "Dropped below 100.00 at 99.94" in pn.locator(".r8 .m8").first.text_content())
    check("the header says where alerts go", EMAIL in page.locator(".h8 span").text_content())
    pn.locator('[data-a="script"]').click()
    check("See the script shows the user's script", pn.locator(".cd8").text_content() == "print(1)")
    pn.locator('[data-a="pause"]').click()
    page.wait_for_function("document.querySelector('.pn8 .s8')?.textContent.includes('Paused')", timeout=10_000)
    check("Pause → Paused (real API), with the paused-by-you banner", "Paused by you" in pn.locator(".bn8").text_content() and sql("SELECT status FROM watchers WHERE id='v5check-gold'") == "PAUSED")
    pn.locator('[data-a="resume"]').click()
    page.wait_for_function("!document.querySelector('.pn8 .s8')?.textContent.includes('Paused')", timeout=10_000)
    check("Resume → armed again", sql("SELECT status FROM watchers WHERE id='v5check-gold'") == "ARMED")
    pn.locator('[data-a="inchat"]').first.click()
    page.wait_for_function("document.querySelector('#ctitle')?.textContent==='GOLDBEES levels this week'", timeout=15_000)
    check("Open in chat opens the chat the watcher came from", True)
    page.click("#navalerts")
    pn.wait_for(timeout=15_000)
    pn.locator('[data-a="cancel"]').click()
    check("Cancel asks once", pn.locator('[data-a="cancel"]').text_content() == "Cancel for good?")
    pn.locator('[data-a="cancel"]').click()
    page.wait_for_function("document.querySelector('.sg8 [data-tab=done] small')?.textContent!=='0'", timeout=10_000)
    check("the second tap cancels it for good", sql("SELECT status FROM watchers WHERE id='v5check-gold'") == "CANCELLED")

    # 2. a real model turn: the confirm card comes before anything is created
    page.click("#new")
    page.wait_for_selector("#form0 .in", timeout=10_000)
    t0 = sql("SELECT now()")
    page.fill(
        "#form0 .in",
        "Set up a watcher that emails me every trading day once the clock passes 15:20 IST, as a reminder to review my "
        "intraday positions before the close. It only needs the clock, no market data. Check every 5 minutes, for 1 day.",
    )
    page.keyboard.press("Enter")
    page.wait_for_selector('.wc5 [data-w="start"]', timeout=300_000)
    check("the turn stops at the confirm card (New watcher, Start watching)", page.locator(".wc5 .wt5").text_content() == "New watcher")
    check("nothing was created before Start", sql(f"SELECT count(*) FROM watchers WHERE user_id='{uid}' AND created_at > '{t0}'") == "0")
    check("the plan says it waits for Start", "Show you the watcher before it starts" in page.locator(".msg.a").last.inner_html())
    page.click('.wc5 [data-w="start"]')
    page.wait_for_selector(".wc5.is-live", timeout=300_000)
    check("Start watching → the card turns live", page.locator(".wc5 .wt5").text_content() == "Watching")
    page.wait_for_function("!document.querySelector('.app').classList.contains('busy')", timeout=300_000)
    wid = sql(f"SELECT id FROM watchers WHERE user_id='{uid}' AND created_at > '{t0}' ORDER BY created_at DESC LIMIT 1")
    created.append(wid)
    check("the MCP created the watcher after Start", bool(wid), wid)
    link = sql(f"SELECT t.title FROM eve.watcher_links l JOIN eve.threads t ON t.id=l.thread_id WHERE l.watcher_id='{wid}'")
    check("the chat it came from is linked", bool(link), link)
    page.click('.wc5 .pr5')
    page.locator(f'.ls8 [data-pick="{wid}"]').wait_for(timeout=15_000)
    page.click(f'.ls8 [data-pick="{wid}"]')
    label = sql(f"SELECT label FROM watchers WHERE id='{wid}'")
    check("Open Watchers shows the new watcher", page.locator(".pn8 h3").text_content() == label, label)
    page.locator('.pn8 [data-a="inchat"]').first.click()
    page.wait_for_selector(".wc5.is-live", timeout=30_000)
    check("Open in chat goes back to the chat with the live card (history renders it)", page.locator(".wc5 .wt5").text_content() == "Watching")
    check("no page errors", not errors, errors[:2])
    browser.close()

cleanup()
server.shutdown()
print(f"\nall {n} checks passed")
