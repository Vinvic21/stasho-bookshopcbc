"""
Stasho AI features
==================

Seven features that run entirely on your own data (no API key, no internet):

  1. Smart Search          - understands "maths grade 4 under 500", "darasa la 5", typos
  2. For You               - personalised picks from orders, wishlist, views + co-purchases
  3. Learning Roadmap      - turns "Grade 4, weak in maths, budget 3000" into a shopping plan
  4. Resale Price Advisor  - fair price range from catalogue price, condition and comparables
  5. Listing Assistant     - cover-photo scan, auto-fill, description + condition suggestion
  6. Trust Shield          - risk scoring for listings, chat messages, reviews and orders
  7. Review Insights       - aspect-based review summary built from real review text
  8. Used vs New Finder    - cheaper used copies from Resell shown on products and in the cart
  9. Smarter School Lists  - stock checks, used copies and substitutes for any list, with a "smart mix" total
 10. Savings Coach         - weekly/monthly target, pace check and projected finish date for School Fund goals
 11. Stock Forecaster      - admin: days of stock left, reorder quantities, slow movers (term-rush aware)
 12. Wanted Board          - buyers post what they need; matching listings trigger alerts

Optional: set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) and Stasho will also use
Claude to polish descriptions, write the roadmap coach note and judge condition from a photo.
Every one of those calls falls back silently to the built-in logic if the key is missing or
the request fails, so nothing in the app depends on it.

Wired in from app.py with:  ai_features.register(app, ...)
"""

import base64
import difflib
import io
import json
import os
import re
import statistics
from datetime import date, datetime, timedelta

import requests
from flask import jsonify, request

try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:  # same optional dependency app.py already uses for school-list photos
    OCR_AVAILABLE = False

try:
    from PIL import Image as _PILImage
except ImportError:
    _PILImage = None


# ═════════════════════════════════════════════════════════════════════════════
# Shared text helpers
# ═════════════════════════════════════════════════════════════════════════════
def words(text):
    return re.findall(r"[a-z0-9']+", (text or "").lower())


def norm(w):
    """Very light stemming so pencil/pencils and book/books match."""
    w = w.lower().strip("'")
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


STOP = {
    "a", "an", "the", "for", "me", "my", "i", "we", "our", "is", "are", "do", "you", "have", "has",
    "want", "need", "needs", "looking", "look", "find", "show", "get", "buy", "please", "some", "any",
    "with", "and", "of", "in", "to", "that", "this", "it", "on", "at", "or", "best", "good", "great",
    "book", "books", "child", "kid", "kids", "son", "daughter", "learner", "pupil", "something",
    # Kiswahili fillers
    "naomba", "ninataka", "natafuta", "kitabu", "vitabu", "la", "ya", "kwa", "na", "wa", "za", "yangu",
}

CATEGORY_SYNONYMS = {
    "Mathematics": {"math", "maths", "mathematics", "mathematic", "hesabu", "arithmetic", "numeracy", "counting", "algebra"},
    "English": {"english", "grammar", "composition", "literature", "novel", "story", "stories", "reading", "fasihi"},
    "Kiswahili": {"kiswahili", "swahili", "kusoma", "insha"},
    "Science": {"science", "sayansi", "technology", "biology", "experiment", "experiments"},
    "Social Studies": {"social", "sst", "geography", "history", "jamii", "citizenship"},
    "Arts": {"art", "arts", "creative", "painting", "craft", "sanaa"},
    "Health": {"hygiene", "nutrition", "health", "afya", "wellness"},
    "Stationery": {"stationery", "pencil", "pen", "pens", "ruler", "eraser", "rubber", "crayon", "bag",
                   "backpack", "manila", "plasticine", "sharpener", "geometry", "exercise", "counter"},
}
SYN_LOOKUP = {}
for _cat, _syns in CATEGORY_SYNONYMS.items():
    for _s in _syns:
        SYN_LOOKUP[norm(_s)] = _cat
# English + Kiswahili number words for grades
NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
             "moja": 1, "mbili": 2, "tatu": 3, "nne": 4, "tano": 5, "sita": 6, "saba": 7}
GRADE_RE = re.compile(
    r"\b(?:grade|gr|class|std|standard|darasa(?:\s+la)?|jss)\s*(?:no\.?)?\s*(\d|one|two|three|four|five|six|seven|"
    r"moja|mbili|tatu|nne|tano|sita|saba)\b|\b(\d)(?:st|nd|rd|th)\s+grade\b",
    re.I,
)
BUDGET_PATTERNS = [
    re.compile(r"(?:under|below|less than|within|max(?:imum)?|budget(?: of| is)?|up to|upto|not more than|"
               r"chini ya|isiyozidi|around|about|<)\s*(?:ksh?s?\.?|kes|shs?\.?)?\s*([\d][\d,]*)", re.I),
    re.compile(r"(?:ksh?s?\.?|kes|shs?\.?)\s*([\d][\d,]*)", re.I),
    re.compile(r"([\d][\d,]*)\s*(?:bob|ksh|kes|shillings|/=)", re.I),
]
CHEAP_WORDS = {"cheap", "cheapest", "affordable", "nafuu", "lowest", "budget-friendly"}


def grade_label(n):
    return f"Grade {int(n)}"


def parse_grade(text):
    m = GRADE_RE.search(text or "")
    if not m:
        return None, text
    raw = (m.group(1) or m.group(2)).lower()
    n = int(raw) if raw.isdigit() else NUM_WORDS.get(raw)
    if not n or not 1 <= n <= 12:
        return None, text
    return grade_label(n), (text[:m.start()] + " " + text[m.end():])


def parse_budget(text):
    for pat in BUDGET_PATTERNS:
        m = pat.search(text or "")
        if m:
            try:
                val = float(m.group(1).replace(",", ""))
            except ValueError:
                continue
            if val >= 10:
                return val, (text[:m.start()] + " " + text[m.end():])
    return None, text


def detect_categories(tokens):
    cats = []
    for t in tokens:
        n = norm(t)
        c = SYN_LOOKUP.get(n)
        if not c and len(n) >= 5:  # tolerate typos like "mathmatics" or "kiswahli"
            close = difflib.get_close_matches(n, list(SYN_LOOKUP), n=1, cutoff=0.85)
            c = SYN_LOOKUP.get(close[0]) if close else None
        if c and c not in cats:
            cats.append(c)
    return cats


def money(n):
    return f"KSh {int(round(n)):,}"


# ═════════════════════════════════════════════════════════════════════════════
# Optional Claude layer (never required)
# ═════════════════════════════════════════════════════════════════════════════
def llm_available():
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def llm_text(system, prompt, image_b64=None, media_type="image/jpeg", max_tokens=400):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        content = []
        if image_b64:
            content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}})
        content.append({"type": "text", "text": prompt})
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5"), "max_tokens": max_tokens,
                  "system": system, "messages": [{"role": "user", "content": content}]},
            timeout=25,
        )
        r.raise_for_status()
        text = "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text").strip()
        return text or None
    except Exception:
        return None


# ═════════════════════════════════════════════════════════════════════════════
# DB setup
# ═════════════════════════════════════════════════════════════════════════════
def init_tables(conn):
    cur = conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS product_views (
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        views INTEGER NOT NULL DEFAULT 1,
        last_at TEXT,
        PRIMARY KEY (user_id, product_id)
    )""")
    cur.execute("""CREATE TABLE IF NOT EXISTS wanted_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        category TEXT DEFAULT '',
        grade TEXT DEFAULT '',
        max_price REAL,
        status TEXT DEFAULT 'open',
        notified TEXT DEFAULT '[]',
        created_at TEXT
    )""")
    cur.execute("""CREATE TABLE IF NOT EXISTS savings_plans (
        user_id INTEGER PRIMARY KEY,
        deadline TEXT,
        grade TEXT DEFAULT '',
        updated_at TEXT
    )""")
    cols = [r[1] for r in cur.execute("PRAGMA table_info(resale_listings)").fetchall()]
    if "description" not in cols:
        cur.execute("ALTER TABLE resale_listings ADD COLUMN description TEXT DEFAULT ''")
    conn.commit()


# ═════════════════════════════════════════════════════════════════════════════
# Catalogue matching + price model (used by features 4, 5 and 6)
# ═════════════════════════════════════════════════════════════════════════════
COND_FACTOR = {"like new": 0.70, "good": 0.55, "fair": 0.40}


def cond_factor(cond):
    return COND_FACTOR.get((cond or "good").strip().lower(), 0.55)


def title_tokens(text):
    return {norm(w) for w in words(text)} - {norm(s) for s in STOP} - {"cbc"}


def match_catalog(db, text, grade="", min_score=0.5):
    """Best catalogue product for free text (a title or OCR output). Returns (row, score)."""
    q = title_tokens(text)
    if not q:
        return None, 0.0
    best, best_score = None, 0.0
    for p in db.execute("SELECT * FROM products").fetchall():
        pt = title_tokens(p["title"])
        if not pt:
            continue
        inter = len(q & pt)
        if not inter:
            continue
        score = 0.5 * inter / len(pt) + 0.5 * inter / len(q)
        if grade and p["grade"] and p["grade"].lower() == grade.lower():
            score += 0.15
        elif grade and p["grade"] and p["grade"].lower() != grade.lower():
            score -= 0.35
        if score > best_score:
            best, best_score = p, score
    return (best, best_score) if best_score >= min_score else (None, best_score)


def _rows_similar(db, title, category, grade, exclude_id=None):
    qt = title_tokens(title)
    out = []
    for r in db.execute("SELECT * FROM resale_listings WHERE status IN ('active','sold')").fetchall():
        if exclude_id and r["id"] == exclude_id:
            continue
        rt = title_tokens(r["title"])
        if not rt or not qt:
            continue
        jac = len(qt & rt) / len(qt | rt)
        same_group = (category and r["category"] and category.lower() == r["category"].lower()
                      and grade and r["grade"] and grade.lower() == r["grade"].lower())
        if jac >= 0.5 or (same_group and jac >= 0.25):
            out.append(r)
    return out


def estimate_price(db, title, category="", grade="", condition="Good", exclude_id=None):
    """Return a price estimate dict, or None when there is no data at all to base one on."""
    prod, _ = match_catalog(db, title, grade)
    comps = _rows_similar(db, title, category or (prod["category"] if prod else ""), grade or (prod["grade"] if prod else ""), exclude_id)
    target = cond_factor(condition)
    basis = []
    model = None
    if prod:
        model = prod["price"] * target
        basis.append(f"New price of the matching catalogue book is {money(prod['price'])}; "
                     f"a '{condition}' copy typically sells for about {int(target * 100)}% of that.")
    comp_vals = []
    for c in comps:
        norm_price = c["price"] / cond_factor(c["condition"]) * target
        comp_vals.append(norm_price)
        if c["status"] == "sold":
            comp_vals.append(norm_price)  # sold listings are stronger evidence than asking prices
    market = statistics.median(comp_vals) if comp_vals else None
    if comps:
        basis.append(f"{len(comps)} similar resale listing{'s' if len(comps) != 1 else ''} on Stasho "
                     f"(adjusted for condition) point to about {money(market)}.")
    if model is None and market is None:
        return None
    if model is not None and market is not None:
        w = 0.6 if len(comps) >= 3 else 0.4
        suggested = w * market + (1 - w) * model
    else:
        suggested = market if market is not None else model
    n_evidence = len(comps) + (1 if prod else 0)
    confidence = "high" if len(comps) >= 3 and prod else ("medium" if n_evidence >= 2 else "low")
    r10 = lambda x: max(20, int(round(x / 10.0)) * 10)
    return {
        "low": r10(suggested * 0.88), "suggested": r10(suggested), "high": r10(suggested * 1.12),
        "new_price": prod["price"] if prod else None, "catalog_match": prod["title"] if prod else None,
        "comparables": len(comps), "confidence": confidence, "basis": basis,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 5. Condition from seller's notes (rules) + description writer
# ═════════════════════════════════════════════════════════════════════════════
DOWNGRADE = [
    (r"\b(torn|ripped|missing pages?|loose pages?|falling apart|water damage|wet|stain(?:s|ed)?|mould|mold|smell)\b", 2, "visible damage"),
    (r"\b(scribbl\w*|written in|writing inside|answers? filled|filled in|highlight\w*|underlin\w*|colou?red in)\b", 1, "marks or writing inside"),
    (r"\b(bent|creas\w*|dog-?ear\w*|worn|faded|scuff\w*|cover (?:damaged|torn|peeling))\b", 1, "wear on cover or corners"),
]
UPGRADE = [
    (r"\b(unused|never used|brand new|still sealed|no marks|no writing|clean pages?|like new|pristine)\b", 2, "kept clean and unused"),
]


def condition_from_notes(notes):
    notes = (notes or "").lower()
    score, reasons = 0, []
    for pat, pts, why in DOWNGRADE:
        if re.search(pat, notes):
            score -= pts
            reasons.append(why)
    for pat, pts, why in UPGRADE:
        if re.search(pat, notes) and score >= 0:
            score += pts
            reasons.append(why)
    if score >= 2:
        return "Like New", reasons
    if score <= -2:
        return "Fair", reasons
    if score == 1 or not notes.strip():
        return "Good", reasons
    return ("Good" if score >= -1 else "Fair"), reasons


def build_description(title, category, grade, publisher, condition, notes):
    bits = [title.strip()]
    meta = " · ".join(x for x in [grade, category, publisher] if x)
    if meta:
        bits[0] += f" ({meta})"
    cond_line = {"Like New": "Kept in excellent shape, almost like new.",
                 "Good": "In good, usable condition with normal signs of use.",
                 "Fair": "Used copy with visible wear, priced accordingly."}.get(condition, "")
    lines = [bits[0] + ".", cond_line]
    clean_notes = (notes or "").strip().rstrip(".")
    if clean_notes:
        lines.append(f"Seller notes: {clean_notes}.")
    lines.append("Aligned with the Competency-Based Curriculum. Message me on Stasho to agree on pickup or delivery.")
    return " ".join(l for l in lines if l)


def build_keywords(title, category, grade, publisher, condition):
    kws = []
    for w in [title, category, grade, publisher, f"used {category}" if category else "", f"{grade} {category}".strip(),
              condition, "CBC", "second hand", "KICD"]:
        w = (w or "").strip()
        if w and w.lower() not in [k.lower() for k in kws]:
            kws.append(w)
    return kws[:10]


def infer_category_grade(text):
    g, rest = parse_grade(text)
    cats = detect_categories(words(rest))
    return (cats[0] if cats else ""), (g or "")


def _prepare_image(raw):
    """Shrink to <=1024px JPEG for the vision call; returns (b64, media_type) or (None, None)."""
    if not _PILImage:
        return None, None
    try:
        im = _PILImage.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((1024, 1024))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82)
        return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"
    except Exception:
        return None, None


# ═════════════════════════════════════════════════════════════════════════════
# 6. Trust Shield helpers
# ═════════════════════════════════════════════════════════════════════════════
MESSAGE_RULES = [
    (re.compile(r"\b(send|pay|deposit|transfer)\b.{0,40}\b(first|before|in advance|upfront|advance)\b", re.I),
     40, "Asks for payment before you have seen or received the book"),
    (re.compile(r"\b(booking|reservation|delivery|courier|transport|shipping|clearance)\s+(fee|charge|payment)\b", re.I),
     30, "Asks for an upfront fee"),
    (re.compile(r"western union|gift ?card|bitcoin|crypto|paypal|wire transfer|moneygram", re.I),
     40, "Unusual payment method"),
    (re.compile(r"\b(otp|pin|password|verification code)\b", re.I),
     45, "Asks for a PIN, password or code. Never share these with anyone"),
    (re.compile(r"https?://|www\.", re.I), 20, "Contains an external link"),
    (re.compile(r"\b(urgent(?:ly)?|hurry|last chance|right now|immediately)\b", re.I), 10, "Pressure to act fast"),
]


def scan_message(text):
    reasons, score = [], 0
    for pat, pts, why in MESSAGE_RULES:
        if pat.search(text or ""):
            reasons.append(why)
            score += pts
    score = min(score, 100)
    level = "high" if score >= 40 else ("medium" if score >= 20 else "low")
    return {"score": score, "level": level, "reasons": reasons}


def _norm_body(text):
    return re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()


def flag_reviews(db):
    """Return {review_id: [reasons]} for reviews that look inauthentic."""
    rows = db.execute("SELECT * FROM reviews ORDER BY id").fetchall()
    flagged = {}

    def add(rid, why):
        flagged.setdefault(rid, [])
        if why not in flagged[rid]:
            flagged[rid].append(why)

    # copy-pasted text posted by different people
    by_body = {}
    for r in rows:
        b = _norm_body(r["body"])
        if len(b) >= 8:
            by_body.setdefault(b, []).append(r)
    for group in by_body.values():
        if len({g["user_id"] for g in group}) >= 2:
            for g in group:
                add(g["id"], "Identical text posted by different accounts")
    # one account posting many reviews in a short burst
    by_user = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)
    for uid, group in by_user.items():
        times = []
        for g in group:
            try:
                times.append((datetime.fromisoformat(g["created_at"]), g["id"]))
            except (TypeError, ValueError):
                pass
        times.sort()
        for i in range(len(times)):
            window = [t for t in times if timedelta(0) <= t[0] - times[i][0] <= timedelta(minutes=10)]
            if len(window) >= 4:
                for _, rid in window:
                    add(rid, "Account posted 4+ reviews within 10 minutes")
    # promo links / contact details in a review
    for r in rows:
        if re.search(r"https?://|www\.|whatsapp|call me|\b(?:\+?254|0)[17]\d{8}\b", r["body"] or "", re.I):
            add(r["id"], "Contains a link or contact details")
    return flagged


def score_listing(db, listing, estimate_cache=None):
    reasons, score = [], 0
    est = estimate_price(db, listing["title"], listing["category"] or "", listing["grade"] or "",
                         listing["condition"] or "Good", exclude_id=listing["id"])
    if est and est["confidence"] != "low" or (est and est["catalog_match"]):
        sug = est["suggested"]
        if listing["price"] < 0.35 * sug:
            score += 35
            reasons.append(f"Priced far below the typical {money(sug)}. Be cautious of offers that look too good to be true")
        elif listing["price"] < 0.55 * sug:
            score += 12
            reasons.append(f"Priced well below the typical {money(sug)}")
        if est["new_price"] and listing["price"] > est["new_price"]:
            score += 25
            reasons.append(f"Asking more than the new price ({money(est['new_price'])})")
        elif listing["price"] > 1.4 * sug:
            score += 10
            reasons.append(f"Priced above the typical {money(sug)}")
    # seller behaviour
    dup = db.execute("SELECT COUNT(*) c FROM resale_listings WHERE seller_id = ? AND lower(title) = lower(?) AND status='active'",
                     (listing["seller_id"], listing["title"])).fetchone()["c"]
    if dup >= 3:
        score += 20
        reasons.append(f"Seller has {dup} active listings with the same title")
    cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    recent = db.execute("SELECT COUNT(*) c FROM resale_listings WHERE seller_id = ? AND created_at >= ?",
                        (listing["seller_id"], cutoff)).fetchone()["c"]
    if recent >= 6:
        score += 15
        reasons.append(f"Seller posted {recent} listings in the last 24 hours")
    if re.search(r"https?://|www\.|whatsapp|\b(?:\+?254|0)[17]\d{8}\b", (listing["title"] or "") + " " + (listing["description"] if "description" in listing.keys() and listing["description"] else ""), re.I):
        score += 15
        reasons.append("Listing text contains contact details or a link (keep chats and payment details on Stasho)")
    # messages sent by this seller on any thread that look risky
    msgs = db.execute(
        "SELECT m.body FROM resale_messages m JOIN resale_threads t ON t.id = m.thread_id "
        "JOIN resale_listings l ON l.id = t.listing_id WHERE m.sender_id = ? AND l.seller_id = ?",
        (listing["seller_id"], listing["seller_id"])).fetchall()
    risky = sum(1 for m in msgs if scan_message(m["body"])["level"] != "low")
    if risky:
        score += min(30, 15 * risky)
        reasons.append(f"Seller sent {risky} chat message{'s' if risky != 1 else ''} flagged as risky")
    score = min(score, 100)
    level = "high" if score >= 50 else ("medium" if score >= 25 else "low")
    return {"score": score, "level": level, "reasons": reasons}


# ═════════════════════════════════════════════════════════════════════════════
# 7. Review insights (aspect-based)
# ═════════════════════════════════════════════════════════════════════════════
ASPECTS = {
    "Content & explanations": {"content", "explain", "explanation", "example", "exercise", "accurate", "clear", "clearly",
                               "understand", "lesson", "topic", "question", "maelezo", "activity", "activities"},
    "Price & value": {"price", "priced", "cheap", "expensive", "affordable", "value", "worth", "cost", "ghali", "nafuu", "bei", "money"},
    "Print & durability": {"quality", "paper", "page", "cover", "binding", "print", "printing", "durable", "sturdy",
                           "thin", "ink", "tore", "torn", "flimsy", "colour", "color", "picture", "illustration"},
    "Delivery": {"delivery", "delivered", "arrived", "arrive", "late", "delay", "delayed", "fast", "quick", "quickly",
                 "courier", "shipping", "prompt", "timely"},
    "Packaging": {"packaging", "packed", "wrapped", "box", "damaged", "intact", "sealed"},
    "Age fit & difficulty": {"easy", "hard", "difficult", "age", "level", "simple", "fun", "engaging", "kids", "learner", "boring"},
}
ASPECT_LOOKUP = {}
for _a, _ks in ASPECTS.items():
    for _k in _ks:
        ASPECT_LOOKUP.setdefault(norm(_k), []).append(_a)

POS_WORDS = {norm(w) for w in {
    "great", "good", "excellent", "love", "loved", "clear", "helpful", "easy", "amazing", "affordable", "durable",
    "perfect", "recommend", "recommended", "quality", "fast", "quick", "wonderful", "sturdy", "nice", "nzuri", "bora",
    "nafuu", "intact", "prompt", "timely", "safe", "secure", "fun", "engaging", "simple", "satisfied", "happy",
    "informative", "colourful", "colorful", "worth", "cheap", "well",
}}
NEG_WORDS = {norm(w) for w in {
    "bad", "poor", "confusing", "late", "expensive", "damaged", "slow", "torn", "wrong", "missing", "disappointing",
    "flimsy", "worst", "broken", "small", "mbaya", "ghali", "delayed", "delay", "thin", "boring", "difficult", "hard",
    "blurry", "faded", "dirty", "crumpled", "cheaply", "useless", "errors", "mistakes", "unclear",
}}
NEGATORS = {"not", "no", "never", "isn't", "wasn't", "didn't", "don't", "doesn't", "hakuna", "si", "without", "hardly"}
PHRASE_POS = ["on time", "value for money", "worth it", "good value", "well packed", "well packaged", "arrived quickly"]
PHRASE_NEG = ["took long", "took weeks", "too late", "falling apart", "pages fell", "fell apart", "not worth", "too expensive"]


def _split_clauses(text):
    return [c.strip() for c in re.split(r"[.!?;\n]+|\s+but\s+|\s+lakini\s+|\s+however\s+", (text or "").lower()) if c.strip()]


def _clause_sentiment(clause):
    toks = words(clause)
    val = 0
    for ph in PHRASE_POS:
        if ph in clause:
            val += -1 if re.search(r"\bnot\s+" + re.escape(ph), clause) else 1
    for ph in PHRASE_NEG:
        if ph in clause:
            val -= 1
    for i, t in enumerate(toks):
        n = norm(t)
        s = 1 if n in POS_WORDS else (-1 if n in NEG_WORDS else 0)
        if s and any(p in NEGATORS for p in toks[max(0, i - 2):i]):
            s = -s
        val += s
    return val


def review_insights(db, product_id):
    rows = db.execute("SELECT r.*, u.name AS user_name FROM reviews r LEFT JOIN users u ON u.id = r.user_id "
                      "WHERE r.product_id = ? ORDER BY r.id", (product_id,)).fetchall()
    if not rows:
        return {"count": 0, "average": None, "praise": [], "complaints": [], "aspects": [], "suspicious_count": 0,
                "verdict": "No reviews yet. Be the first to review this item."}
    flagged_all = flag_reviews(db)
    flagged = {r["id"] for r in rows if r["id"] in flagged_all}
    avg = sum(r["rating"] for r in rows) / len(rows)
    trusted = [r for r in rows if r["id"] not in flagged]
    trusted_avg = (sum(r["rating"] for r in trusted) / len(trusted)) if trusted else None

    agg = {a: {"pos": 0, "neg": 0, "mentions": 0, "quote_pos": None, "quote_neg": None} for a in ASPECTS}
    for r in trusted:
        per_review = {}
        for clause in _clause_sentiment_clauses(r["body"]):
            text, sentiment = clause
            for a in per_review_aspects(text):
                if sentiment == 0:
                    sentiment = 1 if r["rating"] >= 4 else (-1 if r["rating"] <= 2 else 0)
                d = per_review.setdefault(a, [0, None])
                d[0] += sentiment
                if sentiment != 0 and d[1] is None:
                    d[1] = text
        for a, (sent, quote) in per_review.items():
            agg[a]["mentions"] += 1
            if sent > 0:
                agg[a]["pos"] += 1
                if agg[a]["quote_pos"] is None and quote:
                    agg[a]["quote_pos"] = quote[:140]
            elif sent < 0:
                agg[a]["neg"] += 1
                if agg[a]["quote_neg"] is None and quote:
                    agg[a]["quote_neg"] = quote[:140]

    aspects = []
    for a, d in agg.items():
        if not d["mentions"]:
            continue
        if d["pos"] and d["neg"]:
            label = "Mixed"
        elif d["pos"]:
            label = "Praised"
        elif d["neg"]:
            label = "Criticised"
        else:
            label = "Mentioned"
        aspects.append({"name": a, "mentions": d["mentions"], "positive": d["pos"], "negative": d["neg"],
                        "label": label, "quote": d["quote_neg"] if label == "Criticised" else d["quote_pos"] or d["quote_neg"]})
    aspects.sort(key=lambda x: x["mentions"], reverse=True)

    if not trusted:
        verdict = "These reviews look unreliable, so there is no trusted rating yet."
    elif avg >= 4.5:
        verdict = "Readers overwhelmingly love this one."
    elif avg >= 3.5:
        verdict = "Mostly positive feedback, with a few minor gripes."
    elif avg >= 2.5:
        verdict = "Mixed opinions. Read a couple of reviews before buying."
    else:
        verdict = "Several readers reported issues with this item."

    parts = []
    n = len(trusted)
    for a in aspects[:3]:
        parts.append(f"{a['mentions']} of {n} reviewer{'s' if n != 1 else ''} mention {a['name'].lower()} "
                     f"({a['positive']} positive, {a['negative']} negative)")
    return {
        "count": len(rows), "average": round(avg, 1),
        "trusted_average": round(trusted_avg, 1) if trusted_avg is not None else None,
        "distribution": {str(s): sum(1 for r in rows if r["rating"] == s) for s in range(5, 0, -1)},
        "aspects": aspects,
        "praise": [a["name"] for a in aspects if a["label"] == "Praised"][:5],
        "complaints": [a["name"] for a in aspects if a["label"] == "Criticised"][:5],
        "verdict": verdict,
        "breakdown": "; ".join(parts),
        "suspicious_count": len(flagged),
    }


def _clause_sentiment_clauses(body):
    return [(c, _clause_sentiment(c)) for c in _split_clauses(body)]


def per_review_aspects(clause):
    found = []
    for t in words(clause):
        for a in ASPECT_LOOKUP.get(norm(t), []):
            if a not in found:
                found.append(a)
    return found


def build_roadmap(db, product_to_json, grade, text, budget, extra_focus=None):
    """Shared by the Learning Roadmap and the Savings Coach. Returns (stages, total, trimmed, gaps, tips, focus)."""
    gnum = int(re.sub(r"\D", "", grade) or 0)
    products = [p for p in db.execute("SELECT * FROM products WHERE stock > 0").fetchall()]

    focus = []
    for c in detect_categories(words(text)):
        if c != "Stationery" and c not in focus:
            focus.append(c)
    for c in (extra_focus or []):
        if c in CATEGORY_SYNONYMS and c != "Stationery" and c not in focus:
            focus.append(c)

    used = set()
    stages = []

    def take(items, prio):
        out = []
        for p in items:
            if p["id"] in used:
                continue
            used.add(p["id"])
            d = product_to_json(p)
            d["priority"] = prio
            out.append(d)
        return out

    core = [p for p in products if p["category"] != "Stationery" and p["grade"] == grade]
    stages.append({"key": "core", "title": f"{grade} core books",
                   "why": "The main textbooks for the grade.", "items": take(core, 1)})

    order = (["exercise", "pencil", "eraser", "crayon", "plasticine", "drawing", "counter"] if gnum <= 3
             else ["exercise", "pencil", "eraser", "ruler", "geometry", "coloring", "manila"])
    stat = []
    for kw in order:
        hit = next((p for p in products if p["category"] == "Stationery" and kw in p["title"].lower() and p["id"] not in used
                    and p not in stat), None)
        if hit:
            stat.append(hit)
    stages.append({"key": "stationery", "title": "Daily essentials",
                   "why": "Stationery that suits this age group.", "items": take(stat[:4], 2) + take(stat[4:], 3)})

    gaps = []
    if focus:
        extra = []
        for c in focus:
            cands = [p for p in products if p["category"] == c and p["id"] not in used and p["grade"]
                     and abs(int(re.sub(r"\D", "", p["grade"]) or 0) - gnum) <= 1]
            cands.sort(key=lambda p: abs(int(re.sub(r"\D", "", p["grade"]) or 0) - gnum))
            if cands:
                extra += cands[:2]
            else:
                gaps.append(f"We don't have extra {c} titles near {grade} in stock yet.")
        # a focus subject whose core book is already in stage 1 is still reflected in the plan
        stages.append({"key": "focus", "title": f"Strengthen: {', '.join(focus)}",
                       "why": "Extra practice or revision material in the subjects you flagged.",
                       "items": take(extra, 2)})
    enrich = [p for p in products if p["category"] in ("English", "Arts") and p["id"] not in used
              and (not p["grade"] or p["grade"] == grade) and p["category"] != "Stationery"
              and ("story" in p["title"].lower() or p["category"] == "Arts")]
    stages.append({"key": "enrich", "title": "Reading & creativity",
                   "why": "Story and art materials to build a reading habit.", "items": take(enrich[:2], 4)})
    stages = [s for s in stages if s["items"]]

    all_items = [i for s in stages for i in s["items"]]
    trimmed = []
    total = sum(i["price"] for i in all_items)
    if budget is not None:
        for i in sorted(all_items, key=lambda x: (-x["priority"], -x["price"])):
            if total <= budget or i["priority"] <= 1:
                continue
            trimmed.append(i)
            total -= i["price"]
        tid = {i["id"] for i in trimmed}
        for s in stages:
            s["items"] = [i for i in s["items"] if i["id"] not in tid]
        stages = [s for s in stages if s["items"]]
    for s in stages:
        s["subtotal"] = sum(i["price"] for i in s["items"])
    total = sum(s["subtotal"] for s in stages)

    tips = []
    if focus:
        tips.append(f"Short, regular practice in {', '.join(focus)} usually beats long weekend cramming.")
    if gnum <= 3:
        tips.append("Read aloud together for 10 to 15 minutes a day.")
    else:
        tips.append("Keep one exercise book per subject so revision notes stay organised.")
    if budget is not None and trimmed:
        tips.append(f"To stay within {money(budget)} I left out {len(trimmed)} optional item"
                    f"{'s' if len(trimmed) != 1 else ''}; you can still add them below.")
    if budget is not None and stages and stages[0]["key"] == "core" and stages[0]["subtotal"] > budget:
        tips.append(f"The core books alone cost {money(stages[0]['subtotal'])}, which is above your budget. "
                    f"Check Resell for used copies.")

    return stages, total, trimmed, gaps, tips, focus



# ═════════════════════════════════════════════════════════════════════════════
# 8/9. Used alternatives + list analysis (Used vs New Finder, Smarter School Lists)
# ═════════════════════════════════════════════════════════════════════════════
GENERIC_TOKENS = {"set", "pack", "sheet", "pcs", "hb", "a4", "junior", "size", "colour", "color"}


def first_name(name):
    return (name or "Seller").split()[0]


def used_alternatives(db, product, exclude_seller=None, limit=3):
    """Active resale listings that are the same book as `product`, cheaper, and not high-risk."""
    pt = title_tokens(product["title"])
    out = []
    if not pt:
        return out
    rows = db.execute("SELECT l.*, u.name AS seller_name FROM resale_listings l "
                      "LEFT JOIN users u ON u.id = l.seller_id WHERE l.status = 'active'").fetchall()
    for l in rows:
        if exclude_seller and l["seller_id"] == exclude_seller:
            continue
        lt = title_tokens(l["title"])
        if not lt:
            continue
        if len(pt & lt) / len(pt | lt) < 0.6:
            continue
        if product["grade"] and l["grade"] and product["grade"].lower() != l["grade"].lower():
            continue
        if l["price"] >= product["price"]:
            continue
        trust = score_listing(db, l)
        if trust["level"] == "high":
            continue
        saving = product["price"] - l["price"]
        out.append({
            "listing_id": l["id"], "title": l["title"], "condition": l["condition"], "price": l["price"],
            "saving": saving, "saving_pct": int(round(100 * saving / product["price"])),
            "seller": first_name(l["seller_name"]), "trust": trust["level"], "trust_reasons": trust["reasons"][:2],
        })
    out.sort(key=lambda x: (x["trust"] != "low", x["price"]))
    return out[:limit]


def substitutes_for(db, product, limit=2):
    """In-stock look-alikes (same category and grade, shared keyword) for an item that is out of stock."""
    pt = title_tokens(product["title"]) - GENERIC_TOKENS
    out = []
    for p in db.execute("SELECT * FROM products WHERE id != ? AND stock > 0 AND category = ?",
                        (product["id"], product["category"])).fetchall():
        if (p["grade"] or "") != (product["grade"] or ""):
            continue
        if not (pt & (title_tokens(p["title"]) - GENERIC_TOKENS)):
            continue
        out.append(p)
    out.sort(key=lambda p: abs(p["price"] - product["price"]))
    return out[:limit]


def analyze_items(db, items, product_to_json, user_id=None):
    """items = [{"id": product_id, "qty": n}]. Checks stock, finds used copies and look-alikes, and
    works out a 'smart mix' total next to the all-new total."""
    lines, total_new, total_best, unavailable = [], 0.0, 0.0, 0
    for it in items:
        try:
            pid, qty = int(it["id"]), max(1, int(it.get("qty", 1)))
        except (KeyError, TypeError, ValueError):
            continue
        p = db.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        if not p:
            continue
        stock = p["stock"]
        status = "out" if stock <= 0 else ("short" if stock < qty else ("low" if stock <= 5 else "ok"))
        used = used_alternatives(db, p, exclude_seller=user_id, limit=2)
        subs = substitutes_for(db, p) if status in ("out", "short") else []
        line_new = p["price"] * qty

        best = {"type": "new"}
        line_best = line_new
        note = ""
        if status in ("out", "short"):
            if used:
                u = used[0]
                best = {"type": "used", **u}
                line_best = u["price"] + p["price"] * (qty - 1) if status == "short" else u["price"]
                note = "Out of stock new, but a used copy is available." if status == "out" else "Not enough new copies; one used copy can cover the gap."
            elif subs:
                best = {"type": "substitute", "product": product_to_json(subs[0])}
                line_best = subs[0]["price"] * qty
                note = "Out of stock. Closest in-stock item shown; check it suits your list."
            else:
                best = {"type": "unavailable"}
                line_best = 0
                note = "Out of stock and no alternative found yet."
                unavailable += 1
        elif used and used[0]["saving_pct"] >= 20:
            u = used[0]
            best = {"type": "used", **u}
            line_best = u["price"] + p["price"] * (qty - 1)
            note = f"A {u['condition'].lower()} used copy saves {u['saving_pct']}%."
        lines.append({
            "product": product_to_json(p), "qty": qty, "stock_status": status,
            "used": used, "substitutes": [product_to_json(x) for x in subs],
            "best": best, "line_new": line_new, "line_best": line_best, "note": note,
        })
        total_new += line_new
        total_best += line_best
    return {
        "lines": lines, "total_new": total_new, "total_best": total_best,
        "savings": total_new - total_best if unavailable == 0 else None,
        "unavailable": unavailable,
        "used_count": sum(1 for l in lines if l["best"]["type"] == "used"),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 10. Savings Coach
# ═════════════════════════════════════════════════════════════════════════════
def _parse_dt(s):
    try:
        return datetime.fromisoformat(s)
    except (TypeError, ValueError):
        return None


def savings_projection(db, user_id, goal, deadline, today=None):
    today = today or date.today()
    sav = db.execute("SELECT balance FROM savings WHERE user_id = ?", (user_id,)).fetchone()
    balance = float(sav["balance"]) if sav else 0.0
    remaining = max(goal - balance, 0.0)
    days_left = (deadline - today).days

    # actual saving pace from confirmed deposits in the last 60 days
    since = today - timedelta(days=60)
    deps = []
    for r in db.execute("SELECT amount, created_at FROM savings_transactions WHERE user_id = ? AND status = 'paid'",
                        (user_id,)).fetchall():
        d = _parse_dt(r["created_at"])
        if d and d.date() >= since:
            deps.append((d.date(), r["amount"]))
    pace_week = None
    if deps:
        first = min(d for d, _ in deps)
        span_days = max((today - first).days, 7)
        pace_week = sum(a for _, a in deps) / span_days * 7

    status = "not_started"
    projected = None
    if remaining <= 0:
        status = "reached"
    elif days_left <= 0:
        status = "deadline_passed"
    elif pace_week and pace_week > 0:
        proj_days = remaining / (pace_week / 7)
        projected = today + timedelta(days=int(proj_days) + 1)
        status = "on_track" if proj_days <= days_left else "behind"

    weeks_left = max(days_left / 7.0, 1 / 7.0)
    need_week = remaining / weeks_left if remaining > 0 and days_left > 0 else 0
    need_month = remaining / max(days_left / 30.0, 1 / 30.0) if remaining > 0 and days_left > 0 else 0
    round_up = lambda x, step: int(-(-x // step) * step)

    schedule = []
    if remaining > 0 and days_left > 0:
        steps = min(8, max(1, int(days_left // 7)))
        per_step = remaining / steps
        for k in range(1, steps + 1):
            schedule.append({"date": (today + timedelta(days=7 * k)).isoformat(),
                             "target_balance": min(goal, round_up(balance + per_step * k, 10))})
        schedule[-1]["target_balance"] = int(goal)

    tips = []
    if status == "reached":
        tips.append("You've hit your goal. You can use the fund at checkout or keep saving for next term.")
    elif status == "deadline_passed":
        tips.append("The deadline has passed. Pick a new date and I'll recalculate.")
    elif remaining > 0:
        if days_left < 7:
            tips.append(f"Less than a week left. Consider paying the remaining {money(remaining)} in one go or with Lipa Mdogo Mdogo.")
        if status == "behind":
            gap = need_week - (pace_week or 0)
            tips.append(f"At your current pace you'd finish around {projected.strftime('%d %b %Y')}, after your deadline. "
                        f"Adding about {money(round_up(max(gap, 0), 10))} a week would close the gap.")
        if status == "on_track":
            tips.append(f"You're on track: at your current pace you'd reach the goal around {projected.strftime('%d %b %Y')}.")
        if days_left <= 28 and remaining > 0:
            tips.append(f"Short on time? Lipa Mdogo Mdogo lets you split the purchase into 4 payments of about {money(round_up(remaining / 4, 10))}.")
    return {
        "goal": goal, "balance": balance, "remaining": remaining, "days_left": days_left,
        "deadline": deadline.isoformat(), "status": status,
        "weekly_needed": round_up(need_week, 10) if need_week else 0,
        "monthly_needed": round_up(need_month, 10) if need_month else 0,
        "pace_per_week": round(pace_week) if pace_week else None,
        "projected_date": projected.isoformat() if projected else None,
        "schedule": schedule, "tips": tips,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 11. Stock forecaster
# ═════════════════════════════════════════════════════════════════════════════
# Approximate Kenyan school-term openings (month, day). Edit if the ministry calendar differs.
TERM_OPENINGS = [(1, 5), (4, 28), (8, 25)]


def next_term_opening(today):
    cands = []
    for yr in (today.year, today.year + 1):
        for m, d in TERM_OPENINGS:
            dt = date(yr, m, d)
            if dt >= today:
                cands.append(dt)
    return min(cands)


def forecast_stock(db, parse_order_items, paid_statuses, today=None):
    today = today or date.today()
    opening = next_term_opening(today)
    days_to_open = (opening - today).days
    factor = 1.8 if days_to_open <= 30 else (1.3 if days_to_open <= 60 else 1.0)
    season = ("Term-opening rush expected" if factor == 1.8
              else "Stock-up window before term opens" if factor == 1.3 else "No seasonal rush expected")

    marks = ",".join("?" * len(paid_statuses))
    sold14, sold60 = {}, {}
    for o in db.execute(f"SELECT items, created_at FROM orders WHERE status IN ({marks})", paid_statuses).fetchall():
        d = _parse_dt(o["created_at"])
        if not d:
            continue
        age = (today - d.date()).days
        for pid, qty in parse_order_items(o["items"]):
            if age <= 60:
                sold60[pid] = sold60.get(pid, 0) + qty
            if age <= 14:
                sold14[pid] = sold14.get(pid, 0) + qty

    total_units_60 = sum(sold60.values())
    enough_history = total_units_60 >= 15  # below this, "no sales" says little about a product
    items = []
    for p in db.execute("SELECT * FROM products").fetchall():
        u14, u60 = sold14.get(p["id"], 0), sold60.get(p["id"], 0)
        v = 0.6 * (u14 / 14.0) + 0.4 * (u60 / 60.0)
        v_adj = v * factor
        cover = (p["stock"] / v_adj) if v_adj > 0 else None
        confidence = "high" if u60 >= 10 else ("medium" if u60 >= 3 else "low")
        status, reason, reorder, discount = "ok", "", 0, None
        if p["stock"] <= 0:
            status = "out"
            reason = "Out of stock."
        elif cover is not None and cover < 14:
            status = "critical"
            reason = f"About {int(cover)} day{'s' if int(cover) != 1 else ''} of stock left at the expected pace."
        elif cover is not None and cover < 30:
            status = "low"
            reason = f"About {int(cover)} days of stock left at the expected pace."
        elif enough_history and u60 == 0 and p["stock"] >= 10:
            status = "slow"
            reason = f"No sales in 60 days with {p['stock']} in stock."
            discount = "Consider 10 to 15% off or a bundle with a popular item."
        elif enough_history and cover is not None and cover > 180:
            status = "slow"
            reason = f"Stock would last about {int(cover)} days, which is slow-moving."
            discount = "Consider a small discount (about 10%) to free up cash."
        if status in ("out", "critical", "low") and v_adj > 0:
            need = v_adj * 59 - p["stock"]
            reorder = int(-(-max(need, 5) // 5) * 5)
        elif status == "out":
            reorder = None
            reason += " No recent sales, so restock only if you expect demand."
        items.append({
            "id": p["id"], "title": p["title"], "category": p["category"], "grade": p["grade"],
            "stock": p["stock"], "sold_14d": u14, "sold_60d": u60,
            "per_day": round(v_adj, 2), "days_cover": int(cover) if cover is not None else None,
            "status": status, "reason": reason, "reorder_qty": reorder, "discount": discount,
            "confidence": confidence,
        })
    order = {"out": 0, "critical": 1, "low": 2, "slow": 3, "ok": 4}
    items.sort(key=lambda i: (order[i["status"]], i["days_cover"] if i["days_cover"] is not None else 9999))
    counts = {k: sum(1 for i in items if i["status"] == k) for k in order}
    return {
        "as_of": today.isoformat(),
        "season": {"label": season, "next_opening": opening.isoformat(), "days_to_opening": days_to_open, "factor": factor},
        "assumptions": [
            "Expected daily sales = 60% last 14 days + 40% last 60 days, multiplied by the seasonal factor.",
            f"Next term opening is estimated as {opening.strftime('%d %b %Y')}. Edit TERM_OPENINGS in ai_features.py to match the official calendar.",
            "Reorder quantity covers about 45 days of sales plus 14 days of safety stock.",
            "Forecasts with few sales behind them are marked low confidence. Treat them as a hint, not a rule.",
        ],
        "counts": counts, "items": items,
        "units_sold_60d": total_units_60, "enough_history": enough_history,
        "data_note": None if enough_history else
            f"Only {total_units_60} unit{'s' if total_units_60 != 1 else ''} sold in the last 60 days, so slow-mover checks are switched off "
            "and forecasts are rough. They'll sharpen as orders build up.",
    }


# ═════════════════════════════════════════════════════════════════════════════
# 12. Wanted Board matching
# ═════════════════════════════════════════════════════════════════════════════
def parse_want(text):
    g, rest = parse_grade(text)
    b, rest = parse_budget(rest)
    toks = [t for t in words(rest) if t not in STOP and not t.isdigit()]
    cats = detect_categories(toks)
    return {"grade": g or "", "max_price": b, "category": cats[0] if cats else "", "tokens": toks}


def want_matches(db, want, limit=6):
    parsed = parse_want(want["text"])
    wtoks = {norm(t) for t in parsed["tokens"]} - {norm(x) for x in STOP}
    cat = want["category"] or parsed["category"]
    grade = want["grade"] or parsed["grade"]
    max_price = want["max_price"] if want["max_price"] else parsed["max_price"]
    out = []
    rows = db.execute("SELECT l.*, u.name AS seller_name FROM resale_listings l "
                      "LEFT JOIN users u ON u.id = l.seller_id WHERE l.status = 'active'").fetchall()
    for l in rows:
        if l["seller_id"] == want["user_id"]:
            continue
        if max_price and l["price"] > max_price:
            continue
        score = 0
        if cat and (l["category"] or "").lower() == cat.lower():
            score += 40
        if grade and (l["grade"] or "").lower() == grade.lower():
            score += 30
        elif grade and l["grade"] and l["grade"].lower() != grade.lower():
            continue
        ltoks = title_tokens(l["title"])
        for t in wtoks:
            if t in ltoks:
                score += 15
            elif len(t) >= 5 and any(difflib.SequenceMatcher(None, t, w).ratio() >= 0.85 for w in ltoks):
                score += 10
        if score < 55:
            continue
        trust = score_listing(db, l)
        if trust["level"] == "high":
            continue
        out.append({"listing_id": l["id"], "title": l["title"], "category": l["category"], "grade": l["grade"],
                    "condition": l["condition"], "price": l["price"], "seller": first_name(l["seller_name"]),
                    "seller_id": l["seller_id"], "score": score, "trust": trust["level"],
                    "trust_reasons": trust["reasons"][:2]})
    out.sort(key=lambda m: (-m["score"], m["price"]))
    return out[:limit]


# ═════════════════════════════════════════════════════════════════════════════
# Route registration
# ═════════════════════════════════════════════════════════════════════════════
def register(app, get_db, current_user, login_required, admin_required, product_to_json, parse_order_items):

    PAID_STATUSES = ("paid", "placed", "pending_installments")

    # ── status ───────────────────────────────────────────────────────────────
    @app.get("/api/ai/status")
    def ai_status():
        return jsonify({"llm": llm_available(), "ocr": OCR_AVAILABLE})

    # ── 1. Smart search ──────────────────────────────────────────────────────
    @app.get("/api/ai/search")
    def ai_search():
        q = (request.args.get("q") or "").strip()
        db = get_db()
        products = db.execute("SELECT * FROM products").fetchall()
        if not q:
            return jsonify({"parsed": {}, "results": [product_to_json(p) for p in products], "message": ""})

        text = q
        grade, text = parse_grade(text)
        budget, text = parse_budget(text)
        set_books = bool(re.search(r"\bset\s*-?books?\b|\bkcse\b", text, re.I))
        text = re.sub(r"\bset\s*-?books?\b|\bkcse\b", " ", text, flags=re.I)
        social = bool(re.search(r"social\s+studies", text, re.I))
        text = re.sub(r"social\s+studies", " social ", text, flags=re.I)
        toks = [t for t in words(text) if t not in STOP]
        sort_cheap = any(t in CHEAP_WORDS for t in toks)
        toks = [t for t in toks if t not in CHEAP_WORDS]
        toks = [t for t in toks if not t.isdigit()]
        cats = detect_categories(toks)
        if social and "Social Studies" not in cats:
            cats.append("Social Studies")

        results, typos = [], {}
        for p in products:
            ttoks = {norm(w) for w in words(p["title"] + " " + (p["publisher"] or ""))}
            score, why, hit = 0, [], False
            if set_books:
                if "set book" not in p["title"].lower():
                    continue
                score += 30
                why.append("KCSE set book")
            if grade:
                if p["grade"] and p["grade"].lower() != grade.lower():
                    continue
                if p["grade"]:
                    score += 30
                    why.append(grade)
            if cats:
                if p["category"] in cats:
                    score += 30
                    why.append(p["category"])
            for t in toks:
                n = norm(t)
                if n in ttoks:
                    hit = True
                    score += 14
                    if t not in " ".join(why).lower():
                        why.append(f"matches '{t}'")
                elif len(n) >= 4:
                    best = max((difflib.SequenceMatcher(None, n, w).ratio(), w) for w in ttoks) if ttoks else (0, "")
                    if best[0] >= 0.82:
                        hit = True
                        score += 9
                        typos[t] = best[1]
                        why.append(f"'{t}' ~ '{best[1]}'")
                    elif SYN_LOOKUP.get(n) is None and any(w.startswith(n) for w in ttoks):
                        score += 6
            # drop items that match neither the subject nor any keyword the shopper typed
            if cats and p["category"] not in cats and not hit:
                continue
            # a grade search should not drag in ungraded books (set books) or loose stationery
            if grade and not p["grade"] and not set_books and not hit and "Stationery" not in cats:
                continue
            if budget is not None:
                if p["price"] > budget:
                    continue
                score += 5
            if p["stock"] <= 0:
                score -= 10
            only_filters = not toks and (grade or cats or budget is not None or set_books)
            if score > 0 or (only_filters and score >= 0):
                d = product_to_json(p)
                d["score"] = score
                d["why"] = ", ".join(why[:3])
                d["_hit"] = hit
                results.append(d)

        # if some products match the typed keywords directly, show only those (not every item in the subject)
        if any(r["_hit"] for r in results) and toks and not set_books:
            results = [r for r in results if r["_hit"]]
        for r in results:
            r.pop("_hit", None)
        results.sort(key=lambda r: (-r["score"], r["price"]))
        if sort_cheap:
            results.sort(key=lambda r: r["price"])

        parsed = {"grade": grade, "category": cats[0] if cats else None, "budget": budget,
                  "set_books": set_books, "cheapest_first": sort_cheap,
                  "keywords": toks, "typos": typos}
        message = ""
        if not results:
            vocab = {w for p in products for w in words(p["title"]) if len(w) > 3}
            suggestions = []
            for t in toks:
                suggestions += difflib.get_close_matches(t, list(vocab), n=2, cutoff=0.6)
            parsed["did_you_mean"] = list(dict.fromkeys(suggestions))[:3]
            if budget is not None:
                cheapest = None
                cheaper = [p for p in products if (not grade or not p["grade"] or p["grade"].lower() == grade.lower())
                           and (not cats or p["category"] in cats)]
                if cheaper:
                    cheapest = min(cheaper, key=lambda p: p["price"])
                    message = f"Nothing under {money(budget)}. The closest is {cheapest['title']} at {money(cheapest['price'])}."
            if not message:
                message = "No matches. Try fewer words, or a subject and grade like 'maths grade 4'."
        return jsonify({"parsed": parsed, "results": results[:30], "message": message})

    # ── 2. For You ───────────────────────────────────────────────────────────
    @app.post("/api/ai/track-view")
    def ai_track_view():
        user = current_user()
        data = request.get_json(silent=True) or {}
        pid = data.get("product_id")
        if not user or not isinstance(pid, int):
            return jsonify({"ok": True, "tracked": False})
        db = get_db()
        db.execute(
            "INSERT INTO product_views (user_id, product_id, views, last_at) VALUES (?,?,1,?) "
            "ON CONFLICT(user_id, product_id) DO UPDATE SET views = views + 1, last_at = excluded.last_at",
            (user["id"], pid, datetime.utcnow().isoformat()))
        db.commit()
        return jsonify({"ok": True, "tracked": True})

    @app.get("/api/ai/recommendations")
    def ai_recommendations():
        user = current_user()
        grade_hint = (request.args.get("grade") or "").strip()
        limit = request.args.get("limit", default=8, type=int)
        db = get_db()
        products = {p["id"]: p for p in db.execute("SELECT * FROM products").fetchall()}

        pop = {}
        co = {}
        all_orders = db.execute(f"SELECT items FROM orders WHERE status IN ({','.join('?' * len(PAID_STATUSES))})",
                                PAID_STATUSES).fetchall()
        for o in all_orders:
            pids = [pid for pid, _ in parse_order_items(o["items"])]
            for pid in pids:
                pop[pid] = pop.get(pid, 0) + 1
            for a in pids:
                for b in pids:
                    if a != b:
                        co.setdefault(a, {})
                        co[a][b] = co[a].get(b, 0) + 1

        weights = {}  # pid -> (weight, source)
        owned = set()
        counts = {"purchases": 0, "wishlist": 0, "views": 0}
        if user:
            for o in db.execute(f"SELECT items FROM orders WHERE user_id = ? AND status IN ({','.join('?' * len(PAID_STATUSES))})",
                                (user["id"], *PAID_STATUSES)).fetchall():
                for pid, _ in parse_order_items(o["items"]):
                    owned.add(pid)
                    weights[pid] = max(weights.get(pid, 0), 3)
                    counts["purchases"] += 1
            for w in db.execute("SELECT product_id FROM wishlist WHERE user_id = ?", (user["id"],)).fetchall():
                weights[w["product_id"]] = max(weights.get(w["product_id"], 0), 2)
                counts["wishlist"] += 1
            for v in db.execute("SELECT product_id, views FROM product_views WHERE user_id = ?", (user["id"],)).fetchall():
                weights[v["product_id"]] = max(weights.get(v["product_id"], 0), 1)
                counts["views"] += 1

        cat_aff, grade_aff, pub_aff = {}, {}, {}
        for pid, w in weights.items():
            p = products.get(pid)
            if not p:
                continue
            cat_aff[p["category"]] = cat_aff.get(p["category"], 0) + w
            if p["grade"]:
                grade_aff[p["grade"]] = grade_aff.get(p["grade"], 0) + w
            if p["publisher"]:
                pub_aff[p["publisher"]] = pub_aff.get(p["publisher"], 0) + w

        def nz(d):
            m = max(d.values()) if d else 0
            return {k: v / m for k, v in d.items()} if m else {}
        cat_aff, grade_aff, pub_aff = nz(cat_aff), nz(grade_aff), nz(pub_aff)
        max_pop = max(pop.values()) if pop else 0
        max_co = 1

        co_score = {}
        for pid, w in weights.items():
            for other, c in co.get(pid, {}).items():
                co_score.setdefault(other, [0, pid])
                co_score[other][0] += c * w
                if c * w > co_score[other][0] - c * w:
                    co_score[other][1] = pid
        if co_score:
            max_co = max(v[0] for v in co_score.values())

        cold = not weights and not grade_hint
        scored = []
        for pid, p in products.items():
            if p["stock"] <= 0:
                continue
            if pid in owned and p["category"] != "Stationery":
                continue
            parts = {
                "co": 0.35 * (co_score.get(pid, [0])[0] / max_co) if co_score else 0,
                "grade": 0.35 * grade_aff.get(p["grade"], 0) if p["grade"] else 0,
                "cat": 0.45 * cat_aff.get(p["category"], 0),
                "pub": 0.08 * pub_aff.get(p["publisher"], 0),
                "pop": 0.05 * (pop.get(pid, 0) / max_pop) if max_pop else 0,
                "hint": 0.4 if grade_hint and p["grade"] == grade_hint else 0,
            }
            score = sum(parts.values())
            if cold:
                score = parts["pop"] + (0.001 if p["stock"] > 0 else 0)
            if score <= 0:
                continue
            top = max(parts, key=parts.get)
            if cold:
                reason = "Popular with other parents" if max_pop else "In stock and ready to ship"
            elif top == "co":
                src = products.get(co_score[pid][1])
                reason = f"Often bought together with {src['title']}" if src else "Often bought together with your picks"
            elif top == "hint":
                reason = f"Matches {grade_hint}"
            elif top == "grade":
                reason = f"Fits the {p['grade']} items you've shopped for"
            elif top == "cat":
                reason = f"You've shown interest in {p['category']}"
            elif top == "pub":
                reason = f"From {p['publisher']}, a publisher you've picked before"
            else:
                reason = "Popular with other parents"
            if pid in owned:
                reason = "Time to restock?"
            d = product_to_json(p)
            d["reason"] = reason
            d["score"] = round(score, 3)
            scored.append(d)
        scored.sort(key=lambda d: d["score"], reverse=True)
        return jsonify({"personalised": not cold, "signals": counts, "results": scored[:limit]})

    # ── 3. Learning roadmap ──────────────────────────────────────────────────
    @app.post("/api/ai/roadmap")
    def ai_roadmap():
        data = request.get_json(silent=True) or {}
        goal = (data.get("goal") or "").strip()
        grade = (data.get("grade") or "").strip()
        budget = data.get("budget")
        text = goal
        g2, text = parse_grade(text)
        b2, text = parse_budget(text)
        grade = grade or g2 or ""
        try:
            budget = float(budget) if budget not in (None, "") else b2
        except (TypeError, ValueError):
            budget = b2
        if not grade:
            return jsonify({"error": "Tell me which grade the learner is in, e.g. 'Grade 4, weak in maths, budget 3000'."}), 400
        db = get_db()
        stages, total, trimmed, gaps, tips, focus = build_roadmap(
            db, product_to_json, grade, text, budget, data.get("focus") or [])

        coach = None
        if llm_available() and stages:
            plan_txt = "; ".join(f"{s['title']}: " + ", ".join(i['title'] for i in s['items']) for s in stages)
            coach = llm_text(
                "You are Soma, a warm, practical assistant for Kenyan parents shopping for CBC learning materials. "
                "Reply in 3 short sentences, plain text, no markdown. Never invent products.",
                f"Learner: {grade}. Parent's goal: {goal or 'general term preparation'}. Plan: {plan_txt}. "
                "Write a short encouraging note explaining how to use these materials.", max_tokens=200)
        return jsonify({
            "profile": {"grade": grade, "budget": budget, "focus": focus},
            "stages": stages, "total": total, "trimmed": trimmed, "gaps": gaps, "tips": tips,
            "coach_note": coach, "ai_used": bool(coach),
        })

    # ── 4. Resale price advisor ──────────────────────────────────────────────
    @app.post("/api/ai/price-advice")
    def ai_price_advice():
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Enter a title first."}), 400
        category, grade = data.get("category") or "", data.get("grade") or ""
        if not (category and grade):
            c2, g2 = infer_category_grade(title)
            category, grade = category or c2, grade or g2
        condition = data.get("condition") or "Good"
        db = get_db()
        est = estimate_price(db, title, category, grade, condition)
        if not est:
            return jsonify({"error": "I don't have enough data to price this one yet. "
                                     "Check what similar books sell for under Browse Listings."}), 404
        verdict = None
        try:
            price = float(data.get("price"))
        except (TypeError, ValueError):
            price = None
        if price is not None:
            if est["new_price"] and price >= est["new_price"]:
                verdict = {"level": "high", "text": f"Your price is at or above the new price ({money(est['new_price'])}). Buyers will choose a new copy."}
            elif price > est["high"]:
                verdict = {"level": "high", "text": "A bit above the usual range. It may take longer to sell."}
            elif price < est["low"]:
                verdict = {"level": "low", "text": "Below the usual range. You could ask for more."}
            else:
                verdict = {"level": "ok", "text": "Right in the fair range. Should sell well."}
        return jsonify({**est, "condition": condition, "verdict": verdict})

    # ── 5. Listing assistant (scan + autofill + description) ─────────────────
    @app.post("/api/ai/listing-assist")
    @login_required
    def ai_listing_assist(user):
        if request.content_type and request.content_type.startswith("multipart/"):
            form = request.form
            image = request.files.get("image")
        else:
            form = request.get_json(silent=True) or {}
            image = None
        title = (form.get("title") or "").strip()
        notes = (form.get("notes") or "").strip()
        category, grade = (form.get("category") or "").strip(), (form.get("grade") or "").strip()
        db = get_db()
        scan = {"used": False, "matches": [], "text_preview": ""}
        raw = image.read() if image else None
        if raw and len(raw) > 8 * 1024 * 1024:
            return jsonify({"error": "That photo is too large. Use one under 8 MB."}), 400

        publisher = ""
        if raw:
            if OCR_AVAILABLE:
                try:
                    ocr_text = pytesseract.image_to_string(Image.open(io.BytesIO(raw)))
                    scan["used"] = True
                    scan["text_preview"] = " ".join(ocr_text.split())[:160]
                    prod, score = match_catalog(db, ocr_text, grade, min_score=0.3)
                    if prod:
                        scan["matches"] = [{"title": prod["title"], "confidence": round(min(score, 1.0), 2)}]
                        title = title or prod["title"]
                        category = category or prod["category"]
                        grade = grade or (prod["grade"] or "")
                        publisher = prod["publisher"] or ""
                except Exception as e:
                    scan["error"] = f"Could not read the photo: {e}"
            else:
                scan["error"] = ("Cover scanning needs pytesseract and the tesseract-ocr program installed on the server. "
                                 "You can still type the title and I'll fill in the rest.")
        if not title:
            return jsonify({"error": "Type a title or upload a clear photo of the cover.", "scan": scan}), 400

        if not (category and grade) or not publisher:
            prod, _ = match_catalog(db, title, grade)
            c2, g2 = infer_category_grade(title)
            category = category or (prod["category"] if prod else c2)
            grade = grade or (prod["grade"] if prod and prod["grade"] else g2)
            publisher = publisher or (prod["publisher"] if prod and prod["publisher"] else "")

        condition, reasons = condition_from_notes(notes)
        photo_used = False
        if raw and llm_available():
            b64, mt = _prepare_image(raw)
            if b64:
                out = llm_text(
                    "You assess the physical condition of second-hand school books from a photo. Reply with JSON only: "
                    '{"condition":"Like New|Good|Fair","reasons":["short reason", ...]}. Judge only what is visible.',
                    "Assess this book's condition.", image_b64=b64, media_type=mt, max_tokens=200)
                try:
                    j = json.loads(re.search(r"\{.*\}", out or "", re.S).group(0))
                    if j.get("condition") in ("Like New", "Good", "Fair"):
                        condition = j["condition"]
                        reasons = [str(r) for r in j.get("reasons", [])][:3] or reasons
                        photo_used = True
                except Exception:
                    pass

        description = build_description(title, category, grade, publisher, condition, notes)
        polished = False
        if llm_available():
            better = llm_text(
                "You write honest, friendly second-hand book listings for a Kenyan school-book marketplace. "
                "Keep to 2 to 3 sentences, plain text. Use only the facts given; never invent damage, editions or prices.",
                f"Title: {title}. Grade: {grade}. Subject: {category}. Publisher: {publisher}. "
                f"Condition: {condition}. Seller notes: {notes or 'none'}. Write the listing description.", max_tokens=200)
            if better:
                description, polished = better, True
        est = estimate_price(db, title, category, grade, condition)
        return jsonify({
            "fields": {"title": title, "category": category, "grade": grade, "publisher": publisher},
            "suggested_condition": condition, "condition_reasons": reasons, "condition_from_photo": photo_used,
            "description": description, "keywords": build_keywords(title, category, grade, publisher, condition),
            "seo_title": f"Used {title} | {condition} | CBC {category}".strip(" |"),
            "price": est, "scan": scan, "ai_polished": polished,
        })

    # ── 6. Trust Shield ──────────────────────────────────────────────────────
    @app.get("/api/ai/trust/listings")
    def ai_trust_listings():
        db = get_db()
        out = {}
        for r in db.execute("SELECT * FROM resale_listings WHERE status = 'active'").fetchall():
            s = score_listing(db, r)
            out[str(r["id"])] = {"level": s["level"], "score": s["score"], "reasons": s["reasons"][:3]}
        return jsonify(out)

    @app.post("/api/ai/trust/check-message")
    @login_required
    def ai_check_message(user):
        data = request.get_json(silent=True) or {}
        return jsonify(scan_message(data.get("body", "")))

    @app.get("/api/ai/trust/admin")
    @admin_required
    def ai_trust_admin(user):
        db = get_db()
        listings = []
        for r in db.execute("SELECT l.*, u.name AS seller_name FROM resale_listings l LEFT JOIN users u ON u.id = l.seller_id "
                            "WHERE l.status = 'active' ORDER BY l.id DESC").fetchall():
            s = score_listing(db, r)
            if s["level"] != "low":
                listings.append({"id": r["id"], "title": r["title"], "price": r["price"], "seller": r["seller_name"],
                                 "seller_id": r["seller_id"], **s})
        listings.sort(key=lambda x: x["score"], reverse=True)

        messages = []
        for m in db.execute("SELECT m.*, u.name AS sender_name FROM resale_messages m LEFT JOIN users u ON u.id = m.sender_id "
                            "ORDER BY m.id DESC LIMIT 500").fetchall():
            s = scan_message(m["body"])
            if s["level"] != "low":
                messages.append({"id": m["id"], "thread_id": m["thread_id"], "sender": m["sender_name"],
                                 "body": m["body"][:200], "created_at": m["created_at"], **s})

        reviews = []
        flagged = flag_reviews(db)
        for rid, why in flagged.items():
            r = db.execute("SELECT r.*, u.name AS user_name, p.title AS product_title FROM reviews r "
                           "LEFT JOIN users u ON u.id = r.user_id LEFT JOIN products p ON p.id = r.product_id WHERE r.id = ?",
                           (rid,)).fetchone()
            if r:
                reviews.append({"id": rid, "product": r["product_title"], "user": r["user_name"], "rating": r["rating"],
                                "body": (r["body"] or "")[:160], "reasons": why})

        orders = []
        by_phone = {}
        for o in db.execute("SELECT * FROM orders WHERE status IN ('pending','failed') ORDER BY id DESC").fetchall():
            if o["phone"]:
                by_phone.setdefault(o["phone"], []).append(o)
        for phone, group in by_phone.items():
            if len(group) >= 3:
                orders.append({"phone": phone, "unpaid_orders": len(group),
                               "refs": [g["ref"] for g in group[:5]],
                               "reasons": [f"{len(group)} orders from this number never completed payment"]})
        return jsonify({
            "summary": {"listings": len(listings), "messages": len(messages), "reviews": len(reviews), "orders": len(orders)},
            "listings": listings, "messages": messages, "reviews": reviews, "orders": orders,
        })


    # ── 8. Used vs New Finder ────────────────────────────────────────────────
    @app.get("/api/ai/used-alternatives")
    def ai_used_alternatives():
        pid = request.args.get("product_id", type=int)
        db = get_db()
        p = db.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone() if pid else None
        if not p:
            return jsonify({"error": "Product not found."}), 404
        user = current_user()
        return jsonify({"new_price": p["price"],
                        "alternatives": used_alternatives(db, p, exclude_seller=user["id"] if user else None)})

    # ── 8/9. Cart and school-list analysis (stock, used copies, look-alikes) ─
    @app.post("/api/ai/analyze-items")
    def ai_analyze_items():
        data = request.get_json(silent=True) or {}
        items = data.get("items") or []
        if not isinstance(items, list) or not items:
            return jsonify({"error": "No items to analyse."}), 400
        user = current_user()
        return jsonify(analyze_items(get_db(), items[:60], product_to_json, user["id"] if user else None))

    # ── 10. Savings Coach ────────────────────────────────────────────────────
    def _coach_for(db, user, goal, deadline_str, grade):
        try:
            deadline = date.fromisoformat(deadline_str)
        except (TypeError, ValueError):
            return None, ("Pick a deadline date.", 400)
        estimate = None
        if grade:
            stages, total, _tr, _gaps, _tips, _focus = build_roadmap(db, product_to_json, grade, "", None, [])
            items = [{"id": i["id"], "qty": 1} for s_ in stages for i in s_["items"]]
            if items:
                an = analyze_items(db, items, product_to_json, user["id"])
                estimate = {"grade": grade, "new_total": total, "smart_total": an["total_best"],
                            "used_count": an["used_count"]}
        if not goal and estimate:
            goal = estimate["new_total"]
        if not goal or goal <= 0:
            return None, ("Set a goal amount, or choose a grade so I can estimate one.", 400)
        out = savings_projection(db, user["id"], float(goal), deadline)
        out["estimate"] = estimate
        out["grade"] = grade
        return out, None

    @app.get("/api/ai/savings-coach")
    @login_required
    def ai_savings_coach_get(user):
        db = get_db()
        plan = db.execute("SELECT * FROM savings_plans WHERE user_id = ?", (user["id"],)).fetchone()
        sav = db.execute("SELECT * FROM savings WHERE user_id = ?", (user["id"],)).fetchone()
        goal = float(sav["goal_amount"]) if sav and sav["goal_amount"] else 0
        if not plan or not plan["deadline"]:
            return jsonify({"plan": None})
        res, err = _coach_for(db, user, goal, plan["deadline"], plan["grade"] or "")
        if err:
            return jsonify({"plan": None})
        return jsonify({"plan": res})

    @app.post("/api/ai/savings-coach")
    @login_required
    def ai_savings_coach_post(user):
        data = request.get_json(silent=True) or {}
        db = get_db()
        try:
            goal = float(data.get("goal_amount") or 0)
        except (TypeError, ValueError):
            goal = 0
        if not goal:
            sav = db.execute("SELECT goal_amount FROM savings WHERE user_id = ?", (user["id"],)).fetchone()
            goal = float(sav["goal_amount"]) if sav and sav["goal_amount"] else 0
        grade = (data.get("grade") or "").strip()
        res, err = _coach_for(db, user, goal, data.get("deadline"), grade)
        if err:
            return jsonify({"error": err[0]}), err[1]
        db.execute("INSERT INTO savings_plans (user_id, deadline, grade, updated_at) VALUES (?,?,?,?) "
                   "ON CONFLICT(user_id) DO UPDATE SET deadline = excluded.deadline, grade = excluded.grade, "
                   "updated_at = excluded.updated_at",
                   (user["id"], data.get("deadline"), grade, datetime.utcnow().isoformat()))
        db.commit()
        return jsonify({"plan": res})

    # ── 11. Stock forecaster (admin) ─────────────────────────────────────────
    @app.get("/api/ai/forecast")
    @admin_required
    def ai_forecast(user):
        return jsonify(forecast_stock(get_db(), parse_order_items, PAID_STATUSES))

    # ── 12. Wanted Board ─────────────────────────────────────────────────────
    @app.post("/api/ai/wanted")
    @login_required
    def ai_wanted_create(user):
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if len(text) < 4:
            return jsonify({"error": "Describe the book you need, e.g. 'Grade 4 Kiswahili under 300'."}), 400
        if len(text) > 200:
            return jsonify({"error": "Keep it under 200 characters."}), 400
        if scan_message(text)["level"] == "high":
            return jsonify({"error": "That text looks like a scam pattern, so I can't post it."}), 400
        db = get_db()
        open_n = db.execute("SELECT COUNT(*) c FROM wanted_requests WHERE user_id = ? AND status = 'open'",
                            (user["id"],)).fetchone()["c"]
        if open_n >= 5:
            return jsonify({"error": "You already have 5 open requests. Close one first."}), 400
        if db.execute("SELECT 1 FROM wanted_requests WHERE user_id = ? AND status = 'open' AND lower(text) = lower(?)",
                      (user["id"], text)).fetchone():
            return jsonify({"error": "You already have an open request with that text."}), 400
        parsed = parse_want(text)
        try:
            max_price = float(data.get("max_price")) if data.get("max_price") not in (None, "") else parsed["max_price"]
        except (TypeError, ValueError):
            max_price = parsed["max_price"]
        cur = db.execute(
            "INSERT INTO wanted_requests (user_id, text, category, grade, max_price, status, notified, created_at) "
            "VALUES (?,?,?,?,?, 'open', '[]', ?)",
            (user["id"], text, parsed["category"], parsed["grade"], max_price, datetime.utcnow().isoformat()))
        db.commit()
        want = db.execute("SELECT * FROM wanted_requests WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify({"id": want["id"], "parsed": {"grade": want["grade"], "category": want["category"],
                                                     "max_price": want["max_price"]},
                        "matches": want_matches(db, want)}), 201

    @app.get("/api/ai/wanted/mine")
    @login_required
    def ai_wanted_mine(user):
        db = get_db()
        out = []
        for w in db.execute("SELECT * FROM wanted_requests WHERE user_id = ? AND status = 'open' ORDER BY id DESC",
                            (user["id"],)).fetchall():
            out.append({"id": w["id"], "text": w["text"], "category": w["category"], "grade": w["grade"],
                        "max_price": w["max_price"], "created_at": w["created_at"], "matches": want_matches(db, w)})
        return jsonify(out)

    @app.get("/api/ai/wanted/board")
    def ai_wanted_board():
        user = current_user()
        db = get_db()
        out = []
        for w in db.execute("SELECT w.*, u.name AS user_name FROM wanted_requests w LEFT JOIN users u ON u.id = w.user_id "
                            "WHERE w.status = 'open' ORDER BY w.id DESC LIMIT 50").fetchall():
            out.append({"id": w["id"], "text": w["text"], "category": w["category"], "grade": w["grade"],
                        "max_price": w["max_price"], "who": first_name(w["user_name"]),
                        "mine": bool(user and user["id"] == w["user_id"]), "created_at": w["created_at"]})
        return jsonify(out)

    @app.get("/api/ai/wanted/for-seller")
    @login_required
    def ai_wanted_for_seller(user):
        """Open requests from other people that match listings this user already has up."""
        db = get_db()
        mine = db.execute("SELECT * FROM resale_listings WHERE seller_id = ? AND status = 'active'", (user["id"],)).fetchall()
        out = []
        if not mine:
            return jsonify(out)
        for w in db.execute("SELECT w.*, u.name AS user_name FROM wanted_requests w LEFT JOIN users u ON u.id = w.user_id "
                            "WHERE w.status = 'open' AND w.user_id != ? ORDER BY w.id DESC LIMIT 100", (user["id"],)).fetchall():
            hits = [m for m in want_matches(db, w, limit=20) if m["seller_id"] == user["id"]]
            if hits:
                out.append({"id": w["id"], "text": w["text"], "who": first_name(w["user_name"]),
                            "max_price": w["max_price"], "your_listings": [h["title"] for h in hits[:3]]})
        return jsonify(out)

    @app.post("/api/ai/wanted/<int:want_id>/close")
    @login_required
    def ai_wanted_close(user, want_id):
        data = request.get_json(silent=True) or {}
        db = get_db()
        w = db.execute("SELECT * FROM wanted_requests WHERE id = ?", (want_id,)).fetchone()
        if not w or w["user_id"] != user["id"]:
            return jsonify({"error": "Request not found."}), 404
        db.execute("UPDATE wanted_requests SET status = ? WHERE id = ?",
                   ("fulfilled" if data.get("fulfilled") else "closed", want_id))
        db.commit()
        return jsonify({"ok": True})

    @app.get("/api/ai/wanted/alerts")
    @login_required
    def ai_wanted_alerts(user):
        """New matches since the last check. Each listing is reported once per request."""
        db = get_db()
        alerts = []
        for w in db.execute("SELECT * FROM wanted_requests WHERE user_id = ? AND status = 'open'", (user["id"],)).fetchall():
            try:
                seen = set(json.loads(w["notified"] or "[]"))
            except ValueError:
                seen = set()
            fresh = [m for m in want_matches(db, w) if m["listing_id"] not in seen]
            if fresh:
                for m in fresh:
                    alerts.append({"want_id": w["id"], "want_text": w["text"], "listing": m})
                db.execute("UPDATE wanted_requests SET notified = ? WHERE id = ?",
                           (json.dumps(sorted(seen | {m["listing_id"] for m in fresh})), w["id"]))
        db.commit()
        return jsonify(alerts)