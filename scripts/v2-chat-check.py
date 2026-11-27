"""Live check of the v2 /chat page (plan-v2-ui V3) on the local stack:
docker Postgres + `npm run dev:mcp` + `npm run dev` started with the fake
Kite endpoints (see scripts/ui-smoke.py for the env). This script hosts the
same fake Zerodha on :4999, connects the test account through it, then drives
two REAL model turns through the app proxy (a few cents):

  1. "call auth_status" — one Zerodha source, a plan, a receipt, the Code tab;
  2. a price question — the fake token makes the MCP's script fail with
     TokenExpired, so the answer must end "interrupted", the banner must
     offer Reconnect Kite, and the box must close;
then reloads to check history renders the same way, and reads /api/usage.

  /usr/bin/python3 scripts/v2-chat-check.py
"""
import json
import os
import sys
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.environ.get("DEV_LOGIN_EMAIL", "test@slash.markets")
CODE = os.environ.get("DEV_LOGIN_CODE", "123456")
n = 0


def check(label, ok, detail=""):
    global n
    n += 1
    print(f"{'✓' if ok else '✗'} {n}. {label}{' — ' + str(detail) if detail else ''}")
    if not ok:
        print("FAILED")
        sys.exit(1)


class FakeKite(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/connect/login":
            state = parse_qs(parse_qs(u.query).get("redirect_params", [""])[0]).get("state", [""])[0]
            self.send_response(302)
            self.send_header("Location", f"{APP}/api/broker/kite/callback?status=success&request_token=RT-v2&state={state}")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path == "/session/token":
            self.rfile.read(int(self.headers.get("content-length", 0)))
            raw = json.dumps({"status": "success", "data": {"user_id": "AB1234", "user_name": "Smoke Trader", "access_token": "kite-smoke-token"}}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        self.send_response(404)
        self.end_headers()

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
token = login["token"]
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{APP}/terms")
    page.evaluate("([t,u])=>{localStorage.setItem('slash_kite.token',t);localStorage.setItem('slash_kite.user',JSON.stringify(u))}", [token, login["user"]])

    # Connect through the fake Zerodha so the MCP has a (fake) session to use.
    start = api("POST", "/api/broker/kite/login/start", token)
    page.goto(start["loginUrl"])
    page.wait_for_url(lambda u: u.startswith(APP), timeout=20_000)
    st = api("GET", "/api/broker", token)
    check("fake Zerodha session stored", st["status"] == "active", st)

    page.goto(f"{APP}/chat")
    page.wait_for_selector("#form0 .in", timeout=30_000)
    check("the v2 chat shell renders on real data", page.locator("#app").count() == 1 and "Kite connected" in page.locator("#ws").text_content())
    check("credits line comes from /api/usage", "credits left" in page.locator(".hero .cr5t").text_content() or "left this month" in page.locator(".hero .cr5t").text_content())

    # turn 1: a cheap tool call
    page.fill("#form0 .in", "Call auth_status and reply with exactly: broker=<the broker field>")
    page.keyboard.press("Enter")
    page.wait_for_selector(".msg.a .st:has-text('Ran next to the data')", timeout=240_000)
    st_line = page.locator(".msg.a .st").last.text_content()
    check("status line names the requests", "request" in st_line, st_line)
    check("plan lists the Zerodha check", page.locator(".pl6 li.is-ok:has-text('Check the Zerodha connection')").count() == 1)
    check("Sources card with a receipt and a Zerodha source", page.locator(".sf5-source:has-text('Zerodha connection')").count() == 1 and page.locator(".sf5 .rc .to").count() == 1)
    check("answer text arrived", "broker=" in page.locator(".msg.a .md").last.text_content())
    check("the chat appears in the sidebar", page.locator("#sess .ss").count() >= 1)

    # turn 2: the fake token makes the script fail with TokenExpired
    page.fill("#form1 .in", "What is the last traded price of INFY? Use run_python.")
    page.keyboard.press("Enter")
    page.wait_for_function("document.querySelector('#app').dataset.auth==='ended'", timeout=300_000)
    check("a TokenExpired tool error flips the app to the ended state", True)
    check("banner offers Reconnect Kite", "Reconnect Kite" in page.locator("#nbb").text_content())
    check("the box closes with the reconnect placeholder", page.locator("#form1 .in").is_disabled() and page.locator("#form1 .in").get_attribute("placeholder") == "Reconnect Kite to ask")
    page.wait_for_function("!document.querySelector('.app').classList.contains('busy')", timeout=120_000)
    last = page.locator(".msg.a").last
    check("the failed script is a source with its error", last.locator(".sf5-source").count() >= 1 or last.locator(".pl6 li.is-stop, .pl6 li.is-ok").count() >= 1)

    # history renders the same way
    sid = page.locator("#sess .ss").first.get_attribute("data-id")
    page.reload()
    page.wait_for_selector("#sess .ss", timeout=30_000)
    page.click(f'#sess .ss[data-id="{sid}"] .t')
    page.wait_for_selector(".msg.a .sf5", timeout=30_000)
    check("reloaded history shows the plan, sources and receipt", page.locator(".msg.a .pl6 li").count() >= 1 and page.locator(".msg.a .sf5 .rc").count() >= 1)

    usage = api("GET", "/api/usage", token)
    check("/api/usage counts this month's cost against $5", usage["allowanceUsd"] == 5 and usage["monthUsd"] > 0 and 0 <= usage["leftPct"] < 100, usage)
    check("no page errors", not errors, errors[:2])
    browser.close()

server.shutdown()
print(f"\nall {n} checks passed")
