"""P5 browser smoke (Playwright/Chromium via the system python3).

Drives the REAL stack: `npm run dev` on APP (with KITE_MCP_URL pointing at the
staging MCP, whose dev login accepts the same test address), a real model turn
(costs a few cents). Steps: login → auto-redirect to the MCP login → OTP → back
with ?mcp=connected → header pill green → send a message → assistant text →
sidebar row → rename → delete → disconnect via API → reload → banner (no auto
bounce) → sign out → login page.

Run: /usr/bin/python3 scripts/ui-smoke.py
"""
import os
import re
import sys
import time
import urllib.request

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


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 860})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. login
    page.goto(APP)
    page.fill('input[type="email"]', EMAIL)
    page.click("text=Send login code")
    page.fill('input[inputmode="numeric"]', CODE)
    page.click("text=Sign in")

    # 2. auto-redirect to the MCP login (plan D4)
    page.wait_for_url(re.compile(r".*/login\?txn=.*"), timeout=30_000)
    check("after login the browser is sent to the MCP login page", "/login?txn=" in page.url, page.url[:70])
    page.fill('input[name="email"]', EMAIL)
    page.click("text=Send code")
    page.fill('input[name="code"]', CODE)
    page.click("text=Sign in")

    # 3. back in the app, connected
    page.wait_for_url(re.compile(re.escape(APP) + r"/.*"), timeout=30_000)
    check("returned to the app", page.url.startswith(APP), page.url)
    pill = page.get_by_test_id("mcp-status")
    pill.wait_for(timeout=15_000)
    page.wait_for_function("document.querySelector('[data-testid=mcp-status]').textContent.includes('connected')", timeout=15_000)
    check("header pill says /markets connected", "connected" in pill.text_content())
    check("?mcp= param cleaned from the URL", "mcp=" not in page.url, page.url)
    check("no reconnect banner while connected", page.get_by_test_id("mcp-banner").count() == 0)

    # 4. one real turn
    page.fill("textarea", "Reply with exactly the word: pong")
    page.keyboard.press("Enter")
    page.wait_for_selector("text=pong", timeout=120_000)
    check("assistant replied in the chat", True)
    page.wait_for_function("document.querySelectorAll('nav [role=button]').length >= 1", timeout=30_000)
    row = page.locator("nav [role=button]").first
    check("sidebar shows the new thread", "pong" in row.text_content().lower(), row.text_content()[:40])

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

    # 6. lose the grant → banner, no auto-bounce (flag already set this session)
    token = page.evaluate("localStorage.getItem('slash_kite.token')")
    req = urllib.request.Request(f"{APP}/api/mcp/disconnect", method="POST", headers={"authorization": f"Bearer {token}"})
    urllib.request.urlopen(req).read()
    page.reload()
    page.get_by_test_id("mcp-banner").wait_for(timeout=15_000)
    time.sleep(2)
    check("banner shown after the grant is gone, no redirect", page.url.startswith(APP) and page.get_by_test_id("mcp-banner").count() == 1)
    check("banner has a Connect button", page.get_by_test_id("mcp-banner").get_by_role("button").count() == 1)

    # 7. sign out
    page.click('button[aria-label="Sign out"]')
    page.click("text=Sign out >> nth=-1")
    page.wait_for_selector('input[type="email"]', timeout=10_000)
    check("sign out returns to the login page", True)
    check("no page errors", not errors, errors[:2])
    browser.close()

print(f"\nall {n} checks passed")
