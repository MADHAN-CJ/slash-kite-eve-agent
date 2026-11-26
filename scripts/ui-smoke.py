"""Browser smoke (Playwright/Chromium via the system python3) for plan §10.

Drives the REAL app (`npm run dev`) against a local MCP (`npm run dev:mcp`) and
a FAKE Zerodha this script hosts on :4999 (Kite's login page + token exchange),
so the whole Login-with-Kite round trip runs without a real broker:

  login → connect screen (not connected) → Login with Kite → fake Kite redirects
  to /api/broker/kite/callback → ?kite=connected → pill green, chat shown →
  one real model turn (auth_status over the silently minted MCP token; costs a
  few cents) → sidebar rename/delete → DELETE /api/broker → reload → connect
  screen again → Continue without Zerodha → chat + banner → sign out.

Start the dev server with the fake wired in:
  KITE_BASE_URL=http://127.0.0.1:4999 KITE_LOGIN_URL=http://127.0.0.1:4999/connect/login \
  KITE_API_KEY=smoke KITE_API_SECRET=smoke npm run dev
Run: /usr/bin/python3 scripts/ui-smoke.py
"""
import json
import os
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
EMAIL = os.environ.get("DEV_LOGIN_EMAIL", "test@slash.markets")
CODE = os.environ.get("DEV_LOGIN_CODE", "123456")
FAKE_PORT = 4999
n = 0


def check(label, ok, detail=""):
    global n
    n += 1
    print(f"{'✓' if ok else '✗'} {n}. {label}{' — ' + str(detail) if detail else ''}")
    if not ok:
        print("FAILED")
        sys.exit(1)


class FakeKite(BaseHTTPRequestHandler):
    """Just enough of kite.zerodha.com + api.kite.trade for the login round trip."""

    exchanges = []
    deletes = 0

    def log_message(self, *_):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/connect/login":
            q = parse_qs(u.query)
            state = parse_qs(q.get("redirect_params", [""])[0]).get("state", [""])[0]
            cb = f"{APP}/api/broker/kite/callback?status=success&request_token=RT-smoke&state={state}"
            self.send_response(302)
            self.send_header("Location", cb)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path == "/session/token":
            body = self.rfile.read(int(self.headers.get("content-length", 0))).decode()
            FakeKite.exchanges.append(parse_qs(body))
            payload = {"status": "success", "data": {"user_id": "AB1234", "user_name": "Smoke Trader", "access_token": "kite-smoke-token"}}
            raw = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        FakeKite.deletes += 1
        raw = b'{"status":"success","data":true}'
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


server = HTTPServer(("127.0.0.1", FAKE_PORT), FakeKite)
threading.Thread(target=server.serve_forever, daemon=True).start()


def api(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(f"{APP}{path}", method=method, headers=headers, data=data)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


# Precondition: the test account must NOT have an active Zerodha session (a previous run or
# a manual replay may have left one). The API cannot delete the row, so "disconnected" is
# also an acceptable starting state.
_pre = api("POST", "/api/auth/verify-otp", None, {"email": EMAIL, "code": CODE})
if api("GET", "/api/broker", _pre["token"])["status"] == "active":
    api("DELETE", "/api/broker", _pre["token"])
_pre_deletes = FakeKite.deletes


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 860})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. login (email OTP = the MCP identity now; no second login anywhere)
    page.goto(APP)
    page.fill('input[type="email"]', EMAIL)
    page.click("text=Send login code")
    page.fill('input[inputmode="numeric"]', CODE)
    page.click("text=Sign in")

    # 2. the connect screen gates the chat
    page.get_by_test_id("connect-screen").wait_for(timeout=30_000)
    status_text = page.get_by_test_id("connect-status").text_content()
    check("after login the connect screen is shown (Zerodha not active)", "not connected" in status_text or "disconnected" in status_text, status_text)
    jwt_user = json.loads(page.evaluate("localStorage.getItem('slash_kite.user')"))
    check("browser session user matches the API login user", jwt_user["id"] == _pre["user"]["id"], (jwt_user["id"], _pre["user"]["id"]))
    check("no MCP login page was involved", "/login?txn=" not in page.url, page.url)
    check("header pill offers Login with Kite", "Login with Kite" in page.get_by_test_id("broker-status").text_content())

    # 3. Login with Kite → fake Zerodha → callback → connected
    page.get_by_test_id("kite-login").click()
    page.wait_for_function("document.querySelector('[data-testid=broker-status]')?.textContent.includes('Zerodha connected')", timeout=30_000)
    check("back in the app with Zerodha connected", True, page.url)
    check("fake Kite received the token exchange with the checksum", len(FakeKite.exchanges) == 1 and "checksum" in FakeKite.exchanges[0], FakeKite.exchanges[:1])
    check("?kite= param cleaned from the URL", "kite=" not in page.url, page.url)
    check("connect screen gone, chat shown", page.get_by_test_id("connect-screen").count() == 0 and page.locator("textarea").count() == 1)
    check("no banner while connected", page.get_by_test_id("broker-banner").count() == 0)
    token = page.evaluate("localStorage.getItem('slash_kite.token')")
    st = api("GET", "/api/broker", token)
    check("broker status API: active, Kite user stored", st["status"] == "active" and st["kiteUserId"] == "AB1234", st)

    # 4. one real turn — the agent must reach the MCP with a silently minted token
    page.fill("textarea", "Call auth_status and reply with exactly: broker=<the broker field>")
    page.keyboard.press("Enter")
    page.wait_for_selector("text=broker=active", timeout=180_000)
    check("assistant reached the MCP as this user (broker=active) without any MCP login", True)
    page.wait_for_function("document.querySelectorAll('nav [role=button]').length >= 1", timeout=30_000)
    row = page.locator("nav [role=button]").first
    check("sidebar shows the new thread", row.count() == 1, row.text_content()[:40])

    # 5. rename + delete
    row.hover()
    row.locator("button").first.click()  # pencil
    page.keyboard.press("Meta+A")
    page.keyboard.type("Smoke thread")
    page.keyboard.press("Enter")
    page.wait_for_selector("text=Smoke thread", timeout=10_000)
    check("rename works", True)
    row.hover()
    page.locator('nav button[aria-label="Delete chat"]').first.click()
    page.wait_for_selector("text=No chats yet.", timeout=10_000)
    check("delete returns to the empty list", True)

    # 6. disconnect → connect screen again → skip → chat with banner
    st = api("DELETE", "/api/broker", token)
    check("disconnect marks the connection disconnected", st["status"] == "disconnected", st)
    page.reload()
    page.get_by_test_id("connect-screen").wait_for(timeout=15_000)
    check("connect screen returns after disconnect", "disconnected" in page.get_by_test_id("connect-status").text_content())
    check("the Zerodha session was invalidated at Kite", FakeKite.deletes == _pre_deletes + 1, FakeKite.deletes)
    page.get_by_test_id("connect-skip").click()
    page.get_by_test_id("broker-banner").wait_for(timeout=10_000)
    check("skipping shows the chat with a Login with Kite banner", page.locator("textarea").count() == 1 and "Login with Kite" in page.get_by_test_id("broker-banner").text_content())
    page.reload()
    time.sleep(1.5)
    check("skip is remembered for the session (no gate on reload)", page.get_by_test_id("connect-screen").count() == 0 and page.get_by_test_id("broker-banner").count() == 1)

    # 7. sign out
    page.click('button[aria-label="Sign out"]')
    page.click("text=Sign out >> nth=-1")
    page.wait_for_selector('input[type="email"]', timeout=10_000)
    check("sign out returns to the login page", True)
    check("no page errors", not errors, errors[:2])
    browser.close()

server.shutdown()
print(f"\nall {n} checks passed")
