"""Compare lab states with the markets-hero reference screenshots (plan-v2-ui §3).

For each state of a flow, at desktop (1440x900) and mobile (390x844, iPhone 13),
this opens `<APP>/lab/<flow>?s=<state>` the way the prototype's own suite opens
its pages — clock frozen at 25 Nov 2026 14:33 IST, seeded Math.random, reduced
motion, animations off, timers run forward 20 s — screenshots it and measures
the pixels that differ from `markets-hero/ux/flows/<flow>/screenshots/<state>-<project>.png`.

Writes ours / ref / diff / side-by-side PNGs to .v2-compare/<flow>/ (git-ignored).

  npm run v2:compare -- ask                 every state of a flow
  npm run v2:compare -- ask answer run      some states
  npm run v2:compare -- --all               every flow
  ... --strict                              exit 1 when a state is over the limit
  ... --live-reference                      capture the current prototype instead of its committed PNG
A state with no committed reference PNG is compared with the running prototype
(`npm run serve` in markets-hero), shot the same way.
Env: APP_BASE_URL (default http://localhost:3000), MARKETS_HERO_DIR (default ../markets-hero),
     MARKETS_HERO_URL (default http://localhost:8770/ux),
     V2_MAX_DIFF (default 0.002, the prototype suite's own limit).
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
APP = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")
HERO = Path(os.environ.get("MARKETS_HERO_DIR", ROOT.parent / "markets-hero"))
PROTO = os.environ.get("MARKETS_HERO_URL", "http://localhost:8770/ux").rstrip("/")
LIMIT = float(os.environ.get("V2_MAX_DIFF", "0.002"))
OUT = ROOT / ".v2-compare"
FIXED = "2026-11-25T14:33:00+05:30"
IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
)
PROJECTS = {
    "desktop": {"viewport": {"width": 1440, "height": 900}},
    "mobile": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "user_agent": IPHONE_UA},
}
SEED = ("let s=42;const __R=()=>((s=(s*16807)%2147483647)/2147483647);const __RAW=Math.random;"
        # Next/React dev internals draw a few randoms at module evaluation; they must not shift our seeded sequence.
        "Math.random=()=>{const c=(new Error().stack||'').split('\\n')[2]||'';return /_next_dist_|next-devtools/.test(c)?__RAW():__R()};")
STILL = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}"


def shoot(browser, project, url, path, clear=False):
    ctx = browser.new_context(device_scale_factor=1, reduced_motion="reduce", **PROJECTS[project])
    page = ctx.new_page()
    page.clock.install(time=FIXED)
    page.add_init_script(SEED + ("try{localStorage.clear()}catch(e){}" if clear else ""))
    page.goto(url, wait_until="load")
    page.add_style_tag(content=STILL)
    for _ in range(40):
        page.clock.run_for(500)
        page.wait_for_timeout(10)
    page.screenshot(path=str(path))
    ctx.close()


def diff_ratio(ours, ref, out):
    a, b = Image.open(ours).convert("RGB"), Image.open(ref).convert("RGB")
    if a.size != b.size:
        return 1.0, f"size {a.size} vs {b.size}"
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    changed = sum(1 for v in d.getdata() if v)
    red = Image.new("RGB", a.size, (255, 60, 60))
    Image.composite(red, b.point(lambda v: v // 3), d).save(out)
    return changed / (a.size[0] * a.size[1]), ""


def side_by_side(ours, ref, out):
    a, b = Image.open(ours).convert("RGB"), Image.open(ref).convert("RGB")
    canvas = Image.new("RGB", (a.width + b.width + 16, max(a.height, b.height)), (255, 0, 255))
    canvas.paste(b, (0, 0))
    canvas.paste(a, (b.width + 16, 0))
    canvas.save(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    strict = "--strict" in sys.argv
    live_reference = "--live-reference" in sys.argv
    flows = json.loads((ROOT / "lib" / "v2" / "flows.json").read_text())["flows"]
    if "--all" in sys.argv:
        wanted = [(f, None) for f in flows]
    elif args:
        match = [f for f in flows if f["id"] == args[0]]
        if not match:
            sys.exit(f"unknown flow {args[0]!r}; one of {[f['id'] for f in flows]}")
        wanted = [(match[0], set(args[1:]) or None)]
    else:
        sys.exit(__doc__)

    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for flow, only in wanted:
            out = OUT / flow["id"]
            out.mkdir(parents=True, exist_ok=True)
            for st in flow["states"]:
                if only and st["id"] not in only:
                    continue
                for project in PROJECTS:
                    name = f"{st['id']}-{project}"
                    ref = HERO / "ux" / "flows" / flow["id"] / "screenshots" / f"{name}.png"
                    ours = out / f"{name}.ours.png"
                    shoot(browser, project, f"{APP}/lab/{flow['id']}?s={st['id']}", ours)
                    if live_reference or not ref.exists():
                        # Capture both implementations with the same browser and clock.
                        ref = out / f"{name}.ref.png"
                        try:
                            shoot(browser, project, f"{PROTO}/flows/{flow['id']}/?s={st['id']}&chrome=0", ref, clear=True)
                        except Exception as e:  # prototype server not running
                            failed += 1
                            print(f"·  {flow['id']}:{name}  could not capture the prototype ({type(e).__name__})")
                            continue
                    ratio, why = diff_ratio(ours, ref, out / f"{name}.diff.png")
                    side_by_side(ours, ref, out / f"{name}.side.png")
                    ok = ratio <= LIMIT
                    failed += 0 if ok else 1
                    print(f"{'✓' if ok else '✗'}  {flow['id']}:{name}  {ratio * 100:.2f}% differs {why}")
        browser.close()
    print(f"\nreference left, ours right: {OUT}/<flow>/<state>-<project>.side.png · limit {LIMIT * 100:.1f}%")
    if strict and failed:
        sys.exit(1)


main()
