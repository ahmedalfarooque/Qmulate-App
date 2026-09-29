from __future__ import annotations

import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output"
BRAND_BOOK = OUTPUT / "brand-book"
ASSETS = OUTPUT / "assets"
SOURCE_ASSETS = ASSETS / "source-exact"
FONTS = ASSETS / "fonts"
WEBSITE = OUTPUT / "website"
WEB_ASSETS = WEBSITE / "assets"
WEB_SOURCE = WEB_ASSETS / "source-exact"
QA = OUTPUT / "qa"
SOURCE_PDF = Path("/Users/synrtechs/Downloads/QMULATE — Brand Guidelines.pdf")

COLORS = {
    "ink": "#0A0B0D",
    "graphite": "#1B1E25",
    "mist": "#8C909B",
    "white": "#ECEEF2",
    "blue": "#5B7CFA",
    "blue_tint": "#8AA4FF",
    "line": "#252A34",
    "panel": "#11141A",
}

W, H = landscape(A4)
M = 48
FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_MONO = "Courier"
FONT_MONO_BOLD = "Courier-Bold"

FONT_URLS = {
    "Outfit-Regular.ttf": "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf",
    "Outfit-Bold.ttf": "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf",
    "GeistMono-Regular.ttf": "https://fonts.gstatic.com/s/geistmono/v5/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeE9KJ5T.ttf",
    "GeistMono-Bold.ttf": "https://fonts.gstatic.com/s/geistmono/v5/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeHaL55T.ttf",
}

# Pixel crops from the 140 DPI render of the supplied one-page PDF.
# These are intentionally source-derived so the expanded package does not
# reconstruct, reinterpret, or redesign the supplied identity.
CROPS = {
    "source-cover": (0, 0, 4356, 1800),
    "source-cover-logo": (1600, 525, 2760, 1370),
    "source-cover-wordmark": (1660, 750, 2700, 960),
    "source-mark": (2095, 525, 2252, 735),
    "source-positioning": (1500, 1800, 3350, 3350),
    "source-mark-panels": (1500, 3200, 3350, 4550),
    "source-clear-space": (1500, 4350, 3350, 5850),
    "source-lockups": (1500, 5300, 3350, 6100),
    "source-horizontal-lockup": (1560, 5730, 1940, 5850),
    "source-misuse": (1500, 6100, 3350, 7250),
    "source-colour": (1500, 7050, 3350, 8750),
    "source-typography": (1500, 8750, 3350, 10450),
    "source-applications-a": (1500, 10450, 3350, 12750),
    "source-applications-b": (1500, 12400, 3350, 14900),
    "source-voice": (1500, 14800, 3350, 16150),
    "source-imagery": (1500, 16000, 3350, 17650),
    "source-footer-logo": (1510, 17150, 3350, 18450),
}


def rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.strip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def mkdirs() -> None:
    for p in [BRAND_BOOK, ASSETS, SOURCE_ASSETS, FONTS, WEBSITE, WEB_ASSETS, WEB_SOURCE, QA]:
        p.mkdir(parents=True, exist_ok=True)


def render_source_pdf() -> Path:
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(f"Missing source PDF: {SOURCE_PDF}")
    render_dir = OUTPUT / "source-render"
    render_dir.mkdir(parents=True, exist_ok=True)
    rendered = render_dir / "page-1.png"
    if not rendered.exists():
        subprocess.run(
            ["pdftoppm", "-png", "-r", "140", str(SOURCE_PDF), str(render_dir / "page")],
            check=True,
        )
    return rendered


def ensure_fonts() -> None:
    global FONT_REGULAR, FONT_BOLD, FONT_MONO, FONT_MONO_BOLD
    for name, url in FONT_URLS.items():
        dest = FONTS / name
        if not dest.exists():
            urllib.request.urlretrieve(url, dest)
    try:
        pdfmetrics.registerFont(TTFont("Outfit-Regular", str(FONTS / "Outfit-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("Outfit-Bold", str(FONTS / "Outfit-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("GeistMono-Regular", str(FONTS / "GeistMono-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("GeistMono-Bold", str(FONTS / "GeistMono-Bold.ttf")))
        FONT_REGULAR = "Outfit-Regular"
        FONT_BOLD = "Outfit-Bold"
        FONT_MONO = "GeistMono-Regular"
        FONT_MONO_BOLD = "GeistMono-Bold"
    except Exception as exc:
        print(f"Font fallback: {exc}")


def create_source_assets(rendered: Path) -> dict[str, Path]:
    src = Image.open(rendered).convert("RGB")
    assets: dict[str, Path] = {}
    for name, box in CROPS.items():
        crop = src.crop(box)
        dest = SOURCE_ASSETS / f"{name}.png"
        crop.save(dest)
        shutil.copy2(dest, WEB_SOURCE / dest.name)
        assets[name] = dest

    mark = Image.open(assets["source-mark"]).convert("RGB")
    for size, name in [(512, "app-icon-512.png"), (192, "app-icon-192.png"), (32, "favicon-32.png"), (16, "favicon-16.png")]:
        icon = Image.new("RGB", (size, size), COLORS["ink"])
        fitted = fit(mark, (int(size * 0.70), int(size * 0.70)))
        icon.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
        icon.save(ASSETS / name)
        icon.save(WEB_ASSETS / name)

    tokens = {
        "source": str(SOURCE_PDF),
        "rule": "Use supplied PDF assets exactly; do not redraw the logo or introduce new photography.",
        "colors": COLORS,
        "typography": {
            "specified_in_source": "Geist Display, Geist, Geist Mono",
            "packaged_for_templates": ["Outfit-Regular", "Outfit-Bold", "GeistMono-Regular", "GeistMono-Bold"],
        },
    }
    (ASSETS / "brand-tokens.json").write_text(json.dumps(tokens, indent=2), encoding="utf-8")
    shutil.copy2(ASSETS / "brand-tokens.json", WEB_ASSETS / "brand-tokens.json")
    shutil.copy2(SOURCE_PDF, OUTPUT / "QMULATE-Brand-Guidelines-v1-source.pdf")
    for font in FONTS.glob("*.ttf"):
        dest_dir = WEB_ASSETS / "fonts"
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(font, dest_dir / font.name)
    return assets


def fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    src_w, src_h = img.size
    dst_w, dst_h = size
    src_ratio = src_w / src_h
    dst_ratio = dst_w / dst_h
    if src_ratio > dst_ratio:
        new_h = int(dst_w / src_ratio)
        return img.resize((dst_w, new_h), Image.Resampling.LANCZOS)
    new_w = int(dst_h * src_ratio)
    return img.resize((new_w, dst_h), Image.Resampling.LANCZOS)


def fill(c: canvas.Canvas, color: str) -> None:
    c.setFillColorRGB(*rgb(color))


def stroke(c: canvas.Canvas, color: str) -> None:
    c.setStrokeColorRGB(*rgb(color))


def rect(c: canvas.Canvas, x: float, y: float, w: float, h: float, color: str, line: str | None = None, radius: float = 0) -> None:
    fill(c, color)
    if line:
        stroke(c, line)
    else:
        c.setStrokeColorRGB(0, 0, 0)
    if radius:
        c.roundRect(x, y, w, h, radius, stroke=1 if line else 0, fill=1)
    else:
        c.rect(x, y, w, h, stroke=1 if line else 0, fill=1)


def img(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float, mode: str = "contain") -> None:
    im = Image.open(path)
    iw, ih = im.size
    if mode == "cover":
        scale = max(w / iw, h / ih)
    else:
        scale = min(w / iw, h / ih)
    nw, nh = iw * scale, ih * scale
    c.drawImage(ImageReader(str(path)), x + (w - nw) / 2, y + (h - nh) / 2, nw, nh, mask="auto")


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = word if not current else f"{current} {word}"
        if text_width(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(c: canvas.Canvas, text: str, x: float, y: float, width: float, size: float = 10.4, leading: float = 15, color: str = COLORS["mist"], font: str | None = None) -> float:
    font = font or FONT_REGULAR
    fill(c, color)
    c.setFont(font, size)
    cursor = y
    for line in wrap(text, font, size, width):
        c.drawString(x, cursor, line)
        cursor -= leading
    return cursor


def label(c: canvas.Canvas, text: str, x: float, y: float, color: str = COLORS["blue_tint"]) -> None:
    fill(c, color)
    c.setFont(FONT_MONO_BOLD, 6.8)
    c.drawString(x, y, text.upper())


def title(c: canvas.Canvas, text: str, x: float = M, y: float = H - 118) -> None:
    label(c, "Source-faithful expansion", x, y + 42)
    fill(c, COLORS["white"])
    c.setFont(FONT_BOLD, 28)
    c.drawString(x, y, text)


def rule(c: canvas.Canvas, x: float, y: float, w: float) -> None:
    stroke(c, COLORS["line"])
    c.setLineWidth(0.55)
    c.line(x, y, x + w, y)


def new_page(c: canvas.Canvas, page_num: int, section: str, page_title: str | None = None) -> None:
    rect(c, 0, 0, W, H, COLORS["ink"])
    fill(c, COLORS["mist"])
    c.setFont(FONT_MONO, 6.5)
    c.drawString(24, H - 25, "QMULATE")
    c.drawRightString(W - 24, H - 25, f"{section.upper()} / PRIVATE & CONFIDENTIAL")
    rule(c, M, 34, W - 2 * M)
    c.drawString(M, 20, "QMULATE BRAND GUIDELINES - SOURCE-FAITHFUL EXPANSION")
    c.drawRightString(W - M, 20, f"{page_num:02d}")
    if page_title:
        title(c, page_title)


def source_panel_page(c: canvas.Canvas, page_num: int, section: str, page_title: str, crop: Path, note: str) -> None:
    new_page(c, page_num, section, page_title)
    img(c, crop, M, 105, 460, 330)
    rect(c, M + 505, 150, 250, 240, COLORS["panel"], COLORS["line"], 7)
    label(c, "Detail expansion", M + 525, 350)
    paragraph(c, note, M + 525, 318, 205, 10.2, 15, COLORS["white"])


def detail_cards(c: canvas.Canvas, cards: list[tuple[str, str]], x: float = M, y: float = 310, w: float = W - 2 * M) -> None:
    gap = 14
    col = (w - gap * (len(cards) - 1)) / len(cards)
    for i, (head, body) in enumerate(cards):
        xx = x + i * (col + gap)
        rect(c, xx, y, col, 135, COLORS["panel"], COLORS["line"], 7)
        label(c, head, xx + 18, y + 100)
        paragraph(c, body, xx + 18, y + 73, col - 36, 8.8, 12.8, COLORS["mist"])


def build_mock_card(c: canvas.Canvas, logo: Path, x: float, y: float, w: float, h: float, heading: str, meta: str, variant: str = "dark") -> None:
    bg = COLORS["panel"] if variant == "dark" else "#ECEEF2"
    line = COLORS["line"] if variant == "dark" else "#D7DCE5"
    rect(c, x, y, w, h, bg, line, 7)
    img(c, logo, x + 18, y + h - 58, min(135, w - 36), 36)
    label(c, meta, x + 18, y + h - 85, COLORS["blue_tint"] if variant == "dark" else COLORS["blue"])
    fill(c, COLORS["white"] if variant == "dark" else COLORS["ink"])
    c.setFont(FONT_BOLD, min(17, w / 13))
    for i, line_text in enumerate(wrap(heading, FONT_BOLD, min(17, w / 13), w - 36)[:3]):
        c.drawString(x + 18, y + h - 118 - i * 22, line_text)
    for n in range(4):
        rule(c, x + 18, y + 42 + n * 18, w - 36)


def build_pdf(assets: dict[str, Path]) -> Path:
    path = BRAND_BOOK / "QMULATE-Brand-Guidelines-v2.pdf"
    c = canvas.Canvas(str(path), pagesize=landscape(A4))
    p = 1

    # 01 - exact-source cover treatment
    rect(c, 0, 0, W, H, COLORS["ink"])
    img(c, assets["source-cover-logo"], W / 2 - 175, H / 2 - 100, 350, 260)
    fill(c, COLORS["mist"])
    c.setFont(FONT_MONO, 7)
    c.drawCentredString(W / 2, 88, "EXPANDED MOCKUPS & DETAIL SYSTEM - BUILT FROM THE SUPPLIED PDF ONLY")
    c.showPage()

    p += 1
    new_page(c, p, "Contents", "Contents")
    contents = [
        "Brand platform and positioning",
        "Messaging and voice",
        "Exact mark, lockups, clear space, and misuse",
        "Colour, typography, layout, data, and imagery",
        "Expanded mockups from the supplied system",
        "Static website page templates",
        "Asset exports and production checklist",
    ]
    y = H - 160
    for i, item in enumerate(contents, 1):
        label(c, f"{i:02d}", M, y)
        fill(c, COLORS["white"])
        c.setFont(FONT_BOLD, 18)
        c.drawString(M + 55, y - 2, item)
        rule(c, M, y - 25, W - 2 * M)
        y -= 52
    c.showPage()

    pages = [
        ("Positioning", "Positioning source", assets["source-positioning"], "This page preserves the supplied positioning language: a family office built to outlast its makers, with multi-asset oversight, endowment structures, and legacy governance as the three core pillars."),
        ("Positioning", "Positioning usage", assets["source-positioning"], "Use the core line exactly where a decisive brand statement is needed. Supporting copy should remain precise, restrained, and structural. Do not introduce hype, lifestyle language, or performance promises."),
        ("Messaging", "Messaging hierarchy", assets["source-positioning"], "Lead with the long-term proposition, then explain the operating system. The order is: category, promise, evidence, pillars, action. This keeps client material clear and senior."),
        ("Logo system", "The mark", assets["source-mark-panels"], "The mark remains the stacked strata mark shown in the supplied file. Do not redraw, restyle, recolour, rotate, thicken, round, or reinterpret the bars."),
        ("Logo system", "Mark meaning", assets["source-mark-panels"], "The shorter blue stratum is the newest layer, still compounding. The white strata below express accumulated structure, ledger, and continuity."),
        ("Logo system", "Clear space", assets["source-clear-space"], "Clear space is measured from one stratum height. Keep type, edges, images, and UI chrome outside that protected area."),
        ("Logo system", "Minimum size", assets["source-clear-space"], "Use the supplied minimum sizes as written: 24 px digital, 10 mm print, and 16 px favicon. Below that, use the mark-only version."),
        ("Logo system", "Approved lockups", assets["source-lockups"], "Only the four supplied lockups are approved: horizontal, stacked, on light, and mark only. Use these exactly as shown."),
        ("Logo system", "Lockup placement", assets["source-lockups"], "Horizontal is the default for website headers, business cards, proposals, and signatures. Stacked is only for constrained width or ceremonial use."),
        ("Logo system", "Misuse", assets["source-misuse"], "The misuse rules are literal: do not recolour, stretch, rotate, add effects, place on low contrast, or change the ratio."),
        ("Visual system", "Colour", assets["source-colour"], "The colour system stays monochrome with one blue thread. Blue is reserved for the top stratum, links, primary actions, and active states."),
        ("Visual system", "Colour proportions", assets["source-colour"], "Keep compositions neutral first: roughly 70 ink, 22 grey, 8 blue. Blue should signal, not decorate."),
        ("Visual system", "Typography", assets["source-typography"], "The supplied guideline specifies Geist throughout: display for headlines, Geist for text, and mono styling for captions and tabular financial values."),
        ("Visual system", "Type usage", assets["source-typography"], "Keep hierarchy tight: one headline, one supporting text block, then rules or data. Figures must align and should use mono/tabular styling."),
        ("Visual system", "Imagery", assets["source-imagery"], "Use only the visual direction represented in the supplied imagery panel: dark, low-blue, structural, abstract, and restrained. Do not introduce new building photography."),
        ("Visual system", "Imagery treatment", assets["source-imagery"], "The imagery treatment is a near-monochrome system. Treat it as texture and atmosphere, not a hero-photo library."),
        ("Applications", "Applications source", assets["source-applications-a"], "The original applications establish the mockup style: dark cards, restrained surfaces, clean lockups, blue accents, and no decorative imagery."),
        ("Applications", "Applications continuation", assets["source-applications-b"], "Continue the same system across social, proposal, signage, app icons, and avatars. The identity should remain quiet and precise."),
        ("Voice", "Voice source", assets["source-voice"], "The supplied voice system is confident, specific, and quiet. Structure does the persuading."),
        ("Voice", "Voice usage", assets["source-voice"], "Write like a senior partner: short sentences, specific nouns, no superlatives, no exclamation marks, no generic luxury claims."),
    ]
    for section, page_title, crop, note in pages:
        p += 1
        source_panel_page(c, p, section, page_title, crop, note)
        c.showPage()

    # Detail-only pages with no new imagery.
    detail_pages = [
        ("Brand platform", "Expanded brand platform", [
            ("Promise", "Organise multi-asset wealth into governed systems that can endure beyond one generation."),
            ("Proof", "Property, equities, holdings, and reporting are treated as one operating picture."),
            ("Tone", "Dark, precise, architectural, and restrained. Confidence expressed through structure."),
        ]),
        ("Messaging", "Reusable message blocks", [
            ("Short descriptor", "Private family office for multi-asset oversight, endowment structures, and legacy governance."),
            ("Website intro", "We organise, govern, and preserve long-term value across generations."),
            ("Proposal intro", "This memorandum outlines a governed structure for preserving value and carrying intent."),
        ]),
        ("Visual system", "Layout rules", [
            ("Grid", "Use strong alignment, thin dividers, and generous negative space."),
            ("Cards", "Use cards only for framed tools, mockups, and repeated items."),
            ("Blue", "Reserve blue for the mark, active states, links, and primary actions."),
        ]),
        ("Visual system", "Data rules", [
            ("Numerals", "Use mono/tabular figures for every financial value."),
            ("Charts", "Use greys first and one blue highlight for the selected or active measure."),
            ("Labels", "Currency, period, and scope should always be visible."),
        ]),
    ]
    for section, page_title, cards in detail_pages:
        p += 1
        new_page(c, p, section, page_title)
        detail_cards(c, cards)
        paragraph(c, "This page expands the supplied guideline with implementation detail only. It does not alter the approved visual identity.", M, 205, 560, 11, 16, COLORS["mist"])
        c.showPage()

    mockups = [
        ("Applications", "Business card detail", "Faisal Al-Mansouri", "Business card - front"),
        ("Applications", "Letterhead detail", "Private Client Memorandum", "A4 letterhead"),
        ("Applications", "Proposal cover detail", "Structured for generations.", "Proposal cover"),
        ("Applications", "Email signature detail", "Faisal Al-Mansouri", "Email signature"),
        ("Applications", "Social post detail", "Multi-asset oversight.", "Social template"),
        ("Applications", "Dashboard detail", "SAR 48.2m", "Portfolio dashboard"),
        ("Website", "Website home template", "Wealth, structured to outlast its makers.", "Home page"),
        ("Website", "Website approach template", "Map. Structure. Govern. Report.", "Approach page"),
        ("Website", "Website services template", "Oversight. Structures. Governance.", "Services page"),
        ("Website", "Website contact template", "Request an introduction.", "Contact page"),
    ]
    for section, page_title, heading, meta in mockups:
        p += 1
        new_page(c, p, section, page_title)
        build_mock_card(c, assets["source-horizontal-lockup"], M, 150, 330, 260, heading, meta)
        build_mock_card(c, assets["source-horizontal-lockup"], M + 380, 150, 330, 260, heading, meta, "dark")
        paragraph(c, "Mockup extension uses only the supplied logo crop, original colours, thin rules, dark cards, and restrained copy style. No new photography or alternate logo construction is introduced.", M, 105, 640, 10.2, 14, COLORS["mist"])
        c.showPage()

    final_pages = [
        ("Production", "Asset export guide", [
            ("Source crops", "PNG", "Exact crops from the supplied PDF render."),
            ("Website templates", "HTML/CSS", "Static page templates using source-derived assets."),
            ("Icons", "PNG", "Resized from the exact source mark crop."),
            ("Tokens", "JSON", "Colour and usage notes from the supplied guideline."),
        ]),
        ("Production", "Implementation checklist", [
            ("Logo", "Never redraw or replace the supplied mark."),
            ("Imagery", "Do not introduce new building photography."),
            ("Colour", "Keep blue below 10 percent of the composition."),
            ("Copy", "Keep language confident, specific, and quiet."),
        ]),
    ]
    for section, page_title, rows in final_pages:
        p += 1
        new_page(c, p, section, page_title)
        y = 390
        for row in rows:
            label(c, row[0], M, y)
            fill(c, COLORS["white"])
            c.setFont(FONT_BOLD, 14)
            c.drawString(M + 145, y - 2, row[1])
            if len(row) > 2:
                paragraph(c, row[2], M + 265, y, 380, 9.5, 13, COLORS["mist"])
            rule(c, M, y - 30, W - 2 * M)
            y -= 62
        c.showPage()

    p += 1
    rect(c, 0, 0, W, H, COLORS["ink"])
    img(c, assets["source-footer-logo"], W / 2 - 285, H / 2 - 110, 570, 220)
    fill(c, COLORS["mist"])
    c.setFont(FONT_MONO, 7)
    c.drawCentredString(W / 2, 72, "SOURCE-FAITHFUL EXPANSION - NO REDRAWN LOGO - NO GENERATED PHOTOGRAPHY")
    c.save()
    return path


def shell(title: str, active: str, body: str) -> str:
    links = [("Home", "index.html"), ("Approach", "approach.html"), ("Services", "services.html"), ("Contact", "contact.html")]
    nav = "".join(f'<a class="{"active" if label == active else ""}" href="{href}">{label}</a>' for label, href in links)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} - QMULATE</title>
  <link rel="icon" href="assets/favicon-32.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <a class="brand" href="index.html"><img src="assets/source-exact/source-horizontal-lockup.png" alt="QMULATE"></a>
    <nav>{nav}</nav>
  </header>
  <main>{body}</main>
  <footer><img src="assets/source-exact/source-mark.png" alt=""><span>QMULATE</span><span>Private &amp; Confidential</span></footer>
</body>
</html>
"""


def build_website(assets: dict[str, Path]) -> None:
    css = """@font-face{font-family:Outfit;src:url("assets/fonts/Outfit-Regular.ttf") format("truetype");font-weight:400}
@font-face{font-family:Outfit;src:url("assets/fonts/Outfit-Bold.ttf") format("truetype");font-weight:700}
@font-face{font-family:"Geist Mono";src:url("assets/fonts/GeistMono-Regular.ttf") format("truetype");font-weight:400}
:root{--ink:#0A0B0D;--graphite:#1B1E25;--mist:#8C909B;--white:#ECEEF2;--blue:#5B7CFA;--line:#252A34;--panel:#11141A}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--white);font-family:Outfit,Arial,sans-serif}a{color:inherit;text-decoration:none}
header{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,6vw,72px);border-bottom:1px solid var(--line);background:var(--ink)}
.brand img{width:178px;display:block}nav{display:flex;gap:clamp(16px,4vw,44px);font:700 12px/1 "Geist Mono",monospace;text-transform:uppercase;letter-spacing:.14em;color:var(--mist)}nav .active,nav a:hover{color:#8AA4FF}
.hero{min-height:calc(100svh - 76px);display:grid;align-items:center;padding:72px clamp(24px,7vw,96px);position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% 10%,rgba(91,124,250,.14),transparent 28%),linear-gradient(120deg,rgba(27,30,37,.75),transparent 50%);opacity:.9}
.hero-inner{position:relative;max-width:720px}.source-logo{width:min(460px,92vw);margin-bottom:38px}.eyebrow{color:#8AA4FF;font:700 11px/1 "Geist Mono",monospace;text-transform:uppercase;letter-spacing:.16em}
h1{font-size:clamp(42px,7vw,84px);line-height:.96;margin:20px 0 22px}h2{font-size:clamp(30px,4.8vw,58px);line-height:1;margin:0 0 20px}h3{font-size:22px;margin:0 0 10px}
p{color:var(--mist);font-size:16px;line-height:1.65;max-width:680px}.button{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;margin-top:28px;border-radius:4px;background:var(--blue);font:700 12px/1 "Geist Mono",monospace;text-transform:uppercase;letter-spacing:.1em}
section{padding:88px clamp(24px,7vw,96px);border-top:1px solid var(--line)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}.card{background:var(--ink);padding:30px;min-height:220px}.source-panel{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}.source-panel img{width:100%;border:1px solid var(--line);border-radius:8px}.list{display:grid;gap:22px;max-width:860px}.row{display:grid;grid-template-columns:180px 1fr;gap:30px;padding:22px 0;border-top:1px solid var(--line)}footer{display:flex;align-items:center;gap:18px;padding:28px clamp(24px,7vw,96px);border-top:1px solid var(--line);color:var(--mist);font:400 11px/1 "Geist Mono",monospace;text-transform:uppercase;letter-spacing:.14em}footer img{width:34px}
@media(max-width:760px){header{height:auto;min-height:92px;align-items:flex-start;flex-direction:column;padding-block:18px}nav{width:100%;justify-content:space-between;font-size:10px;gap:8px}.source-panel,.grid{grid-template-columns:1fr}.row{grid-template-columns:1fr;gap:8px}.hero{min-height:calc(100svh - 92px)}}"""
    (WEBSITE / "styles.css").write_text(css, encoding="utf-8")

    hero_logo = '<img class="source-logo" src="assets/source-exact/source-cover-logo.png" alt="QMULATE">'
    home = f"""<section class="hero"><div class="hero-inner">{hero_logo}<div class="eyebrow">Family office - Riyadh</div><h1>Wealth, structured to outlast its makers.</h1><p>Multi-asset oversight, endowment structures, and legacy governance. This static template uses only the supplied identity assets.</p><a class="button" href="contact.html">Request an introduction</a></div></section>
<section><div class="grid"><article class="card"><div class="eyebrow">01</div><h3>Multi-asset oversight</h3><p>One coherent view across property, equities, and holdings.</p></article><article class="card"><div class="eyebrow">02</div><h3>Endowment structures</h3><p>Vehicles designed to compound and protect over decades.</p></article><article class="card"><div class="eyebrow">03</div><h3>Legacy governance</h3><p>Rules and reporting that carry intent between generations.</p></article></div></section>"""
    approach = f"""<section class="hero"><div class="hero-inner">{hero_logo}<div class="eyebrow">Approach</div><h1>Map. Structure. Govern. Report.</h1><p>The page template extends the supplied system without adding new imagery or changing the mark.</p></div></section><section><div class="source-panel"><img src="assets/source-exact/source-positioning.png" alt=""><div><h2>Structure does the persuading.</h2><p>Use the original positioning hierarchy, short paragraphs, and restrained blue emphasis.</p></div></div></section>"""
    services = f"""<section class="hero"><div class="hero-inner">{hero_logo}<div class="eyebrow">Services</div><h1>Oversight. Structures. Governance.</h1><p>Services are framed as parts of one governed operating system.</p></div></section><section><div class="source-panel"><img src="assets/source-exact/source-applications-a.png" alt=""><div><h2>Application-ready.</h2><p>Use the supplied application style for every extension: dark surfaces, exact lockup, thin rules, small blue cues.</p></div></div></section>"""
    contact = f"""<section class="hero"><div class="hero-inner">{hero_logo}<div class="eyebrow">Private introduction</div><h1>Request an introduction.</h1><p>A quiet contact page template using the original logo crop and brand system only.</p><a class="button" href="mailto:introductions@qmulate.ai">introductions@qmulate.ai</a></div></section>"""
    page = f"""<section class="hero"><div class="hero-inner">{hero_logo}<div class="eyebrow">Private note</div><h1>A governed structure for long-term value.</h1><p>Reusable page template for memoranda, explainers, and client-facing notes.</p></div></section><section><div class="list"><div class="row"><strong>Context</strong><p>Set the operating frame in plain language.</p></div><div class="row"><strong>Structure</strong><p>Use short sections, thin rules, and tabular data.</p></div><div class="row"><strong>Implication</strong><p>Close with what the reader should review or decide.</p></div></div></section>"""
    pages = {
        "index.html": shell("Home", "Home", home),
        "approach.html": shell("Approach", "Approach", approach),
        "services.html": shell("Services", "Services", services),
        "contact.html": shell("Contact", "Contact", contact),
        "page.html": shell("Reusable Page", "Home", page),
    }
    for name, html in pages.items():
        (WEBSITE / name).write_text(html, encoding="utf-8")
    (WEBSITE / "README.md").write_text("Static source-faithful QMULATE templates. Open index.html directly in a browser.\n", encoding="utf-8")


def write_readme(pdf_path: Path) -> None:
    (OUTPUT / "README.md").write_text(
        f"""# QMULATE Source-Faithful Brand Package

This corrected package uses the attached PDF as the visual source of truth.

- Brand book PDF: `{pdf_path.relative_to(ROOT)}`
- Website templates: `output/website/index.html`
- Exact source crops: `output/assets/source-exact/`
- Icons from exact source mark crop: `output/assets/`
- Brand tokens: `output/assets/brand-tokens.json`

Correction notes:
- No generated building photography.
- No redrawn or redesigned logo.
- Mockup extensions use the supplied lockup crop, original colours, dark surfaces, thin rules, and restrained blue accent.
""",
        encoding="utf-8",
    )


def main() -> None:
    mkdirs()
    ensure_fonts()
    rendered = render_source_pdf()
    assets = create_source_assets(rendered)
    build_website(assets)
    pdf_path = build_pdf(assets)
    write_readme(pdf_path)
    print(pdf_path)


if __name__ == "__main__":
    main()
