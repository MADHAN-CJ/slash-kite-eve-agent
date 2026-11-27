"""Live check of the v2 Connect Kite dialog and the pop-up login (plan-v2-ui
V4) on the local stack: docker Postgres + `npm run dev` started with the fake
Kite endpoints (see scripts/ui-smoke.py). This script hosts the fake Zerodha
on :4999 and drives, in a real browser:

  not connected → gated chat + dialog → FAQ → Log in with Kite opens a pop-up →
  the fake Zerodha redirects it to the callback → /kite/done closes it →
  this tab shows Connected → the chat opens with the mint strip → a saved
  question card → the window closed early → "Kite didn't connect" → Cancel.

  /usr/bin/python3 scripts/v2-kite-check.py
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
n = 0


def check(label, ok, detail=""):
    global n
    n += 1
    print(f"{'✓' if ok else '✗'} {n}. {label}{' — ' + str(detail) if detail else ''}")
    if not ok:
        print("FAILED")
        sys.exit(1)


class FakeKite(BaseHTTPRequestHandler):
    hold = False  # when True, the login page waits instead of redirecting (lets the test close the window early)

    def log_message(self, *_):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/connect/login":
            if FakeKite.hold:
                raw = b"<html><body>Kite login (held)</body></html>"
                self.send_response(200)
                self.send_header("content-type", "text/html")
                self.send_header("content-length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return
            state = parse_qs(parse_qs(u.query).get("redirect_params", [""])[0]).get("state", [""])[0]
            self.send_response(302)
            self.send_header("Location", f"{APP}/api/broker/kite/callback?status=success&request_token=RT-v4&state={state}")
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
if api("GET", "/api/broker", token)["status"] in ("active", "token_expired"):
    api("DELETE", "/api/broker", token)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{APP}/terms")
    page.evaluate("([t,u])=>{localStorage.setItem('slash_kite.token',t);localStorage.setItem('slash_kite.user',JSON.stringify(u))}", [token, login["user"]])
    page.goto(f"{APP}/chat")
    page.wait_for_function("document.querySelector('#app')?.dataset.auth==='delayed'", timeout=30_000)
    check("not connected: the banner offers Connect Kite", "Connect Kite" in page.locator("#nbb").text_content() and "Read-only" in page.locator("#nbt").text_content())
    check("the box is gated (read-only, dimmed)", page.locator("#form0 .in").get_attribute("readonly") is not None and page.evaluate("document.body.classList.contains('gated')"))
    check("starters are led by Surprise me", page.locator("#ex button").first.text_content().startswith("Surprise me"))

    # a starter behind the gate saves the question and opens the dialog
    page.click("#ex button >> nth=1")
    page.wait_for_selector("#kv.is-on", timeout=10_000)
    check("tapping a starter opens the dialog with the question saved", page.locator("#kv .qcard").count() == 1 and "Reliance" in page.locator("#kv .qcard span").last.text_content())
    check("the preview plays the three steps", page.locator("#pv .c4fr.is-on").count() == 1)
    page.click("#ksafe")
    check("Is it safe? opens the FAQ with the first answer open", page.locator(".c4faq details[open]").count() == 1 and "password" in page.locator(".c4faq details[open] p").text_content())
    page.click("#kbk")
    check("back returns to How connecting works", page.locator("#ka h3").text_content() == "How connecting works")

    # the real pop-up login
    with page.expect_popup(timeout=15_000) as pop:
        page.click("#kgo")
    popup = pop.value
    page.wait_for_selector("#wct", timeout=10_000)
    check("Log in with Kite opens a pop-up and the dialog waits with a countdown", page.locator("#wct").text_content().startswith("4:5") or page.locator("#wct").text_content() == "5:00")
    check("step 1 done, step 2 running", page.locator(".c4steps .is-ok").count() == 1 and page.locator(".c4steps .is-now").count() == 1)
    popup.wait_for_event("close", timeout=30_000)
    check("the pop-up closed itself after the callback", popup.is_closed())
    page.wait_for_selector(".c4big.is-ok", timeout=15_000)
    check("this tab shows Kite connected with all three steps ticked", page.locator(".c4steps .is-ok").count() == 3 and "Running your question now" in page.locator(".c4keep").text_content())
    page.wait_for_function("!document.querySelector('#kv').classList.contains('is-on')", timeout=10_000)
    check("the dialog hands over to the chat", page.locator("#app").get_attribute("data-auth") == "kite" and page.locator("#form0 .in, #form1 .in").first.get_attribute("readonly") is None)
    check("the mint strip shows the session end", "Kite connected until 6:00 AM" in page.locator("#kok").text_content() and "read-only" in page.locator("#kok").text_content())
    page.wait_for_selector(".msg.u", timeout=15_000)
    check("the saved question was sent", "Reliance" in page.locator(".msg.u").first.text_content())
    page.wait_for_function("!document.querySelector('.app').classList.contains('busy')", timeout=300_000)
    st = api("GET", "/api/broker", token)
    check("the session is stored for the MCP", st["status"] == "active" and st["kiteUserId"] == "AB1234")

    # disconnect → the window closed early → fail → Cancel
    api("DELETE", "/api/broker", token)
    page.reload()
    page.wait_for_selector("#nbb", timeout=30_000)
    FakeKite.hold = True
    page.click("#nbb")
    page.wait_for_selector("#kv.is-on", timeout=10_000)
    with page.expect_popup(timeout=15_000) as pop:
        page.click("#kgo")
    popup = pop.value
    page.wait_for_selector("#wct", timeout=10_000)
    popup.close()
    page.wait_for_selector(".c4big.is-bad", timeout=15_000)
    check("closing Kite's window early shows Kite didn't connect", "didn't connect" in page.locator("#ka h3").text_content() and "Nothing was shared" in page.locator(".c4err").text_content())
    check("step 2 marked Login not finished", "Login not finished" in page.locator(".c4steps .is-bad").text_content())
    page.click("#kc")
    page.wait_for_function("!document.querySelector('#kv').classList.contains('is-on')", timeout=5_000)
    check("Not now closes the dialog and the gate stays", page.locator("#form0 .in, #form1 .in").first.get_attribute("readonly") is not None)
    page.keyboard.press("Escape")
    check("no page errors", not errors, errors[:2])
    browser.close()

server.shutdown()
print(f"\nall {n} checks passed")
