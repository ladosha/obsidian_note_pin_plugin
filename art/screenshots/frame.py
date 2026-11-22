"""Frame the raw captures for Obsidian's community page: desktop 1200x800 (3:2) and mobile 900x1600 (9:16).

    uv run --with playwright --with pillow python frame.py

Reads raw/*.png and writes out/desktop-<n>.png and out/mobile-<n>.png. Each shot is drawn at twice the size
in the installed Chrome, then scaled down, so the text stays smooth.

The raw captures:
- desktop-*.png: the demo vault (make_vault.py) in Obsidian on a computer, the window's contents at 1280x760;
- mobile-*.png: the same vault with Obsidian's mobile emulation (app.emulateMobile) at 500x888;
- mobile-shade.png: Android's notification shade, copied from the app repo's art/screenshots/raw/en-US/shade.png.

background.jpg and fonts/ are the store artwork from the app repo, in the style of vladmas.com.
"""
import html
import io
import mimetypes
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

DESKTOP = [
    ("desktop-overview", "note pin", "Color, pin and remind",
     "Colors in the file explorer, a Pinned section above the folders, and every reminder in one list."),
    ("desktop-reminder", "reminders", "Reminders that repeat your way",
     "Daily, every 2 weeks, the first Tuesday, or yearly by the lunar calendar."),
    ("desktop-color", "colors", "Nine colors, or any color",
     "Pick one from the menu, or set any hex color in the note's properties."),
]
MOBILE = [
    ("mobile-shade", "android", "Notes in the notification bar",
     "With the free companion app, pins and reminders arrive on time, even when Obsidian is closed."),
    ("mobile-explorer", "file explorer", "Colors and pins on your phone",
     "The same colors and Pinned section as on your computer."),
    ("mobile-note", "reminders", "See when a note is due",
     "A banner at the top shows the next reminder, with Edit and Remove."),
    ("mobile-list", "notes list", "Everything pinned or coming up",
     "Search, filter, and sort by color or by the next reminder."),
]

GRAIN = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>"
         "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/>"
         "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/></filter>"
         "<rect width='100%' height='100%' filter='url(%23n)'/></svg>")

COMMON = """
  @font-face {{ font-family: "0xProto"; src: url("/fonts/0xProto-Regular.woff2") format("woff2"); }}
  * {{ box-sizing: border-box; margin: 0; }}
  html, body {{ width: {w}px; height: {h}px; overflow: hidden; background: #04060b; }}
  body {{ position: relative; font-family: "0xProto", ui-monospace, monospace; color: #dce5ff;
         -webkit-font-smoothing: antialiased; }}
  .bg {{ position: absolute; inset: 0; background: url("/background.jpg") {bg_x}px 0 / auto {h}px no-repeat; }}
  .bg::before {{ content: ""; position: absolute; inset: 0;
                 background: radial-gradient(70% 45% at {haze}% 75%, rgba(124, 92, 235, 0.22), transparent 70%); }}
  .bg::after {{ content: ""; position: absolute; inset: 0; opacity: 0.07; mix-blend-mode: overlay;
                background-image: url("{grain}"); }}
  .kicker {{ color: #ab92ff; }}
  h1 {{ font-weight: 400; line-height: 1.12; letter-spacing: -0.045em; text-wrap: balance; }}
  p {{ line-height: 1.5; color: #8e9ab3; text-wrap: pretty; }}
"""

DESKTOP_PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>{common}
  .caption {{ position: absolute; left: 64px; top: 52px; right: 64px; display: flex; gap: 40px; align-items: flex-end; }}
  .caption .left {{ flex: 0 0 auto; }}
  .kicker {{ font-size: 17px; }}
  h1 {{ margin-top: 12px; font-size: 40px; }}
  p {{ flex: 1; font-size: 17px; padding-bottom: 4px; }}
  .window {{ position: absolute; left: 64px; right: 64px; top: 196px; padding: 8px; border-radius: 18px;
             background: #0b0e16;
             box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 40px 90px -20px rgba(0,0,0,.9),
                         0 0 90px -10px rgba(124,92,235,.42); }}
  .window img {{ display: block; width: 100%; border-radius: 11px; }}
</style></head><body>
  <div class="bg"></div>
  <div class="window"><img src="/raw/{shot}.png" alt=""></div>
  <div class="caption"><div class="left"><div class="kicker">{kicker}</div><h1>{title}</h1></div><p>{text}</p></div>
</body></html>"""

MOBILE_PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>{common}
  .caption {{ position: absolute; left: 72px; right: 72px; top: 96px; }}
  .kicker {{ font-size: 26px; }}
  h1 {{ margin-top: 20px; font-size: 58px; }}
  p {{ margin-top: 22px; font-size: 26px; }}
  .phone {{ position: absolute; left: 50%; top: 520px; width: 652px; margin-left: -326px; padding: 14px;
            border-radius: 64px; background: #0b0e16;
            box-shadow: inset 0 0 0 2px rgba(255,255,255,.1), 0 50px 100px -25px rgba(0,0,0,.9),
                        0 0 100px -10px rgba(124,92,235,.42); }}
  .phone img {{ display: block; width: 624px; height: auto; border-radius: 50px; }}
</style></head><body>
  <div class="bg"></div>
  <div class="phone"><img src="/raw/{shot}.png" alt=""></div>
  <div class="caption"><div class="kicker">{kicker}</div><h1>{title}</h1><p>{text}</p></div>
</body></html>"""


def page(kind: str, index: int) -> str:
    shots = DESKTOP if kind == "desktop" else MOBILE
    shot, kicker, title, text = shots[index]
    w, h = (1200, 800) if kind == "desktop" else (900, 1600)
    # background.jpg is a 5400x1920 panorama; each shot shows the next stretch of it
    scaled_width = 5400 * h / 1920
    step = (scaled_width - w) / max(len(shots) - 1, 1)
    common = COMMON.format(w=w, h=h, bg_x=-round(step * index), haze=[78, 28, 72, 34][index], grain=GRAIN)
    template = DESKTOP_PAGE if kind == "desktop" else MOBILE_PAGE
    return template.format(common=common, shot=shot, kicker=html.escape(kicker), title=html.escape(title),
                           text=html.escape(text))


def serve(route):
    path = route.request.url.split("frame.test/", 1)[1].split("?")[0]
    if path.startswith("shot/"):
        kind, index = path.split("/")[1:3]
        route.fulfill(status=200, body=page(kind, int(index)), content_type="text/html; charset=utf-8")
        return
    file = HERE / path
    if not file.is_file():
        route.fulfill(status=404, body="not found")
        return
    route.fulfill(status=200, body=file.read_bytes(),
                  content_type=mimetypes.guess_type(file.name)[0] or "application/octet-stream")


OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    for kind, shots, size in (("desktop", DESKTOP, (1200, 800)), ("mobile", MOBILE, (900, 1600))):
        tab = browser.new_page(viewport={"width": size[0], "height": size[1]}, device_scale_factor=2)
        tab.route("http://frame.test/**", serve)
        for index in range(len(shots)):
            tab.goto(f"http://frame.test/shot/{kind}/{index}", wait_until="networkidle")
            tab.evaluate("document.fonts.ready")
            image = Image.open(io.BytesIO(tab.screenshot(type="png"))).convert("RGB")
            target = OUT / f"{kind}-{index + 1}.png"
            image.resize(size, Image.LANCZOS).save(target, optimize=True)
            print(target.name, f"{target.stat().st_size / 1e6:.1f} MB", shots[index][0])
        tab.close()
    browser.close()
