from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Body, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional
import os, requests, json, time, base64, hashlib, re

# --- Config / env ---
load_dotenv()

OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("OPENAI_API_KEY is not set. Put it in .env or your environment.")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # vision + JSON mode
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "60"))
RATE_WINDOW_SEC = int(os.environ.get("RATE_WINDOW_SEC", "3600"))
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))  # 10MB

# When DI/GPT returns only a total but OCR looks rich, force a second parsing pass
FORCE_SECOND_PASS_MIN_ITEMS = int(os.environ.get("FORCE_SECOND_PASS_MIN_ITEMS", "2"))

def _to_bool(v: Optional[str], default: bool = False) -> bool:
    if v is None:
        return default
    clean = v.strip()
    if "#" in clean:
        clean = clean.split("#", 1)[0].strip()
    s = clean.lower()
    if s in {"true", "1", "yes", "y", "on"}:  return True
    if s in {"false", "0", "no", "n", "off"}: return False
    return default

# Feature toggles
AZURE_USE_RECEIPT = _to_bool(os.environ.get("AZURE_USE_RECEIPT"), True)
AZURE_USE_READ    = _to_bool(os.environ.get("AZURE_USE_READ"), True)
RESTAURANT_INCLUDE_TAX_TIP_ITEMS = _to_bool(os.environ.get("RESTAURANT_INCLUDE_TAX_TIP_ITEMS"), True)

# --- Azure resources ---
AZURE_DI_ENDPOINT       = (os.environ.get("AZURE_DI_ENDPOINT") or "").rstrip("/")
AZURE_DI_KEY            = os.environ.get("AZURE_DI_KEY") or ""
AZURE_VISION_ENDPOINT   = (os.environ.get("AZURE_VISION_ENDPOINT") or "").rstrip("/")
AZURE_VISION_KEY        = os.environ.get("AZURE_VISION_KEY") or ""

DI_CONFIGURED     = bool(AZURE_DI_ENDPOINT and AZURE_DI_KEY)
VISION_CONFIGURED = bool(AZURE_VISION_ENDPOINT and AZURE_VISION_KEY)
AZURE_CONFIGURED  = DI_CONFIGURED or VISION_CONFIGURED

AZURE_API_VERSION_DOCS_NEW  = "2024-07-31"  # Document Intelligence (new)
AZURE_API_VERSION_DOCS_OLD  = "2023-07-31"  # Form Recognizer (legacy)
AZURE_API_VERSION_VISION    = "2024-02-01"  # Vision Image Analysis (Read)

# --- App / CORS ---
app = FastAPI(title="SplitChamp AI Backend", version="1.4.1")
origins = [o.strip() for o in ALLOWED_ORIGINS.split(",")] if ALLOWED_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# --- Tiny best-effort rate limit (in-memory) ---
_BUCKET: dict[str, tuple[int, int]] = {}  # ip -> (reset_epoch, count)
def _rate_check(ip: str) -> None:
    now = int(time.time())
    reset, cnt = _BUCKET.get(ip, (now + RATE_WINDOW_SEC, 0))
    if now > reset:
        reset, cnt = now + RATE_WINDOW_SEC, 0
    cnt += 1
    _BUCKET[ip] = (reset, cnt)
    if cnt > RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    _rate_check(ip)
    return await call_next(request)

# --- Schemas ---
class AnalyzeReq(BaseModel):
    image_base64: str

class ReceiptItem(BaseModel):
    id: Optional[str] = None
    description: str
    amount: float
    category: Optional[str] = None  # 'food'|'alcohol'|'appetizer'|'tax'|'tip'|'ignore'

class AnalyzeResp(BaseModel):
    merchant: Optional[str] = None
    date: Optional[str] = None
    total: Optional[float] = None
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    tip: Optional[float] = None
    items: list[ReceiptItem]
    engine: Optional[str] = None

# --- Healthcheck ---
@app.get("/health")
def health():
    reasons = []
    if not DI_CONFIGURED:
        if not AZURE_DI_ENDPOINT: reasons.append("missing AZURE_DI_ENDPOINT")
        if not AZURE_DI_KEY:      reasons.append("missing AZURE_DI_KEY")
    if not VISION_CONFIGURED:
        if not AZURE_VISION_ENDPOINT: reasons.append("missing AZURE_VISION_ENDPOINT")
        if not AZURE_VISION_KEY:      reasons.append("missing AZURE_VISION_KEY")

    return {
        "ok": True,
        "model": MODEL,
        "azure_receipt": AZURE_USE_RECEIPT and DI_CONFIGURED,
        "azure_read": AZURE_USE_READ and VISION_CONFIGURED,
        "azure_configured": AZURE_CONFIGURED,
        "azure_on": (AZURE_USE_RECEIPT and DI_CONFIGURED) or (AZURE_USE_READ and VISION_CONFIGURED),
        "azure_reason": None if not reasons else reasons,
    }

@app.get("/")
def root():
    return {"name": "SplitChamp AI Backend", "version": "1.4.1", "health": "/health"}

# ---- Helpers ----
def _to_b64_jpeg(raw: bytes) -> str:
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large; please send < 10MB")
    return base64.b64encode(raw).decode("utf-8")

def _mk_id(desc: str, amt: float, idx: int) -> str:
    return hashlib.sha1(f"{desc}|{amt}|{idx}".encode("utf-8")).hexdigest()[:12]

_ALC = ["beer","wine","lager","ipa","ale","stout","sauvignon","cabernet","merlot","riesling","pinot",
        "vodka","tequila","whiskey","bourbon","rum","sake","soju","cocktail","margarita","mojito","martini","negroni"]
_NONALC = ["soda","coke","pepsi","sprite","fanta","lemonade","juice","coffee","latte","tea","mocktail"]
_APPS = ["app","appetizer","starter","fries","nachos","wings","edamame","chips","guac","dip","bread","garlic","calamari"]
_IGNORE = ["subtotal","balance","rounding","change","cash","card","auth","approval","points"]

def _category_of(name: str) -> str:
    s = (name or "").lower()
    if not s: return "food"
    if "tax" in s: return "tax"
    if "tip" in s or "gratuity" in s or "service charge" in s: return "tip"
    if any(k in s for k in _IGNORE): return "ignore"
    if any(k in s for k in _ALC): return "alcohol"
    if any(k in s for k in _APPS): return "appetizer"
    # Non-alcoholic drinks count as "food" for splitting
    return "food"

def _coerce_amounts(parsed: dict) -> dict:
    if not isinstance(parsed, dict) or "items" not in parsed or not isinstance(parsed["items"], list):
        raise HTTPException(status_code=502, detail="Response missing items[]")
    for it in parsed["items"]:
        try:
            it["amount"] = float(it.get("amount", 0))
        except Exception:
            it["amount"] = 0.0
    if "subtotal" not in parsed:
        notax = sum(x.get("amount", 0) for x in parsed["items"] if x.get("category") not in ("tax","tip"))
        parsed["subtotal"] = round(float(notax), 2)
    return parsed

def _postprocess_receipt(d: dict, include_tax_tip: bool, tip_percent_override: Optional[float] = None) -> dict:
    raw_items = d.get("items") or []
    cleaned: list[dict] = []

    # Basic cleanup and skip junk rows
    skip_tokens = {"SUBTOTAL", "CHANGE", "CASH", "CARD", "BALANCE", "AUTH", "TOTAL", "ROUNDING"}
    for it in raw_items:
        try:
            desc = (it.get("description") or "Item").strip()
            amt = float(it.get("amount") or 0)
            if amt <= 0:
                continue
            if desc.upper() in skip_tokens:
                continue
            # prefer model category if present; else infer later
            cat = (it.get("category") or "").strip().lower() or None
            cleaned.append({"description": desc, "amount": round(amt, 2), "category": cat})
        except Exception:
            continue

    # Merge duplicates by description (case-insensitive)
    merged: dict[str, dict] = {}
    order_keys: list[str] = []
    for it in cleaned:
        k = it["description"].strip().lower()
        if k not in merged:
            order_keys.append(k)
            merged[k] = {"amount": 0.0, "category": it["category"]}
        merged[k]["amount"] = round(merged[k]["amount"] + it["amount"], 2)
        # keep first non-empty category if found
        if not merged[k]["category"] and it["category"]:
            merged[k]["category"] = it["category"]

    # Numbers reported by the model(s)
    tax = round(float(d.get("tax") or 0), 2)
    tip = round(float(d.get("tip") or 0), 2)

    # Build item list with id + category
    items_out = []
    for i, k in enumerate(order_keys):
        amt = merged[k]["amount"]
        cat = merged[k]["category"] or _category_of(k)
        items_out.append({
            "id": _mk_id(k, amt, i),
            "description": k.title(),
            "amount": amt,
            "category": cat
        })

    sum_items = round(sum(x["amount"] for x in items_out if x["category"] not in ("tax","tip","ignore")), 2)

    # If model didn’t extract a tip but user provided a tip %, derive one
    if tip == 0 and tip_percent_override is not None:
        base_for_tip = sum_items + (tax if include_tax_tip else 0.0)
        tip = round((base_for_tip * float(tip_percent_override)) / 100.0, 2)

    # Total reconciliation
    total = d.get("total")
    if total is None or not isinstance(total, (int, float)):
        total = round(sum_items + tax + tip, 2)
    else:
        total = round(float(total), 2)
        computed = round(sum_items + tax + tip, 2)
        if abs(total - computed) <= 0.02:
            total = computed

    # Optionally include tax/tip as line items (with ids + categories)
    if include_tax_tip:
        if tax > 0:
            items_out.append({"id": _mk_id("tax", tax, 99901), "description": "Tax", "amount": tax, "category": "tax"})
        if tip > 0:
            items_out.append({"id": _mk_id("tip", tip, 99902), "description": "Tip", "amount": tip, "category": "tip"})

    return {
        "merchant": d.get("merchant"),
        "date": d.get("date"),
        "total": total,
        "subtotal": sum_items,
        "tax": tax,
        "tip": tip,
        "items": items_out
    }

# ---------- Azure helpers ----------
def _azure_analyze_receipt(image_bytes: bytes) -> Optional[dict]:
    if not (AZURE_USE_RECEIPT and DI_CONFIGURED):
        return None

    headers = {"Ocp-Apim-Subscription-Key": AZURE_DI_KEY, "Content-Type": "application/octet-stream"}

    # Try the new DI route first
    url_new = f"{AZURE_DI_ENDPOINT}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version={AZURE_API_VERSION_DOCS_NEW}"
    try:
        r = requests.post(url_new, headers=headers, data=image_bytes, timeout=60)
    except requests.RequestException as e:
        print("Azure DI submit network error:", e)
        r = None

    # If 404 (some regions), try legacy formrecognizer route
    if r is None or r.status_code == 404:
        url_old = f"{AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version={AZURE_API_VERSION_DOCS_OLD}"
        try:
            r = requests.post(url_old, headers=headers, data=image_bytes, timeout=60)
        except requests.RequestException as e:
            print("Azure DI legacy submit network error:", e)
            return None

    if r.status_code not in (200, 202):
        print("Azure receipt submit error", r.status_code, r.text[:300])
        return None

    op_url = r.headers.get("operation-location") or r.headers.get("Operation-Location")
    if not op_url:
        # Some regions return body with result synchronously
        try:
            data = r.json()
            analyze_result = data.get("analyzeResult") or data.get("result") or data
            if isinstance(analyze_result, dict):
                return _parse_di_result(analyze_result)
        except Exception:
            pass
        print("Azure receipt: missing operation-location")
        return None

    # Poll
    result = None
    for _ in range(30):
        try:
            pr = requests.get(op_url, headers={"Ocp-Apim-Subscription-Key": AZURE_DI_KEY}, timeout=30)
        except requests.RequestException:
            time.sleep(1.0); continue
        if pr.status_code != 200:
            time.sleep(1.0); continue
        data = pr.json()
        status = data.get("status")
        if status in ("succeeded", "failed", "partiallySucceeded"):
            result = data.get("analyzeResult") or data.get("result") or data
            break
        time.sleep(1.0)

    if not isinstance(result, dict):
        return None

    return _parse_di_result(result)

def _parse_di_result(result: dict) -> Optional[dict]:
    docs = result.get("documents") or []
    if not docs:
        return None
    fields = docs[0].get("fields", {}) if isinstance(docs[0], dict) else {}

    def _num(field):
        v = fields.get(field, {})
        val = v.get("valueNumber") if isinstance(v, dict) else None
        if val is None:
            try:
                val = float(v.get("content")) if isinstance(v, dict) else None
            except Exception:
                val = None
        return float(val) if val is not None else 0.0

    def _str(field):
        v = fields.get(field, {})
        return (v.get("valueString") or v.get("content") or "").strip() if isinstance(v, dict) else ""

    items_out = []
    items = fields.get("Items", {}).get("valueArray") or []
    for it in items:
        f = it.get("valueObject", {}) if isinstance(it, dict) else {}
        conf = it.get("confidence", 1.0) if isinstance(it, dict) else 1.0
        if conf is not None and conf < 0.65:
            continue
        desc = (f.get("Description", {}).get("valueString")
                or f.get("Description", {}).get("content") or "").strip() or "Item"
        amt = f.get("TotalPrice", {}).get("valueNumber")
        if amt is None:
            unit = f.get("Price", {}).get("valueNumber") or 0
            qty = f.get("Quantity", {}).get("valueNumber") or 1
            amt = unit * qty
        try:
            items_out.append({"description": desc, "amount": float(amt or 0)})
        except Exception:
            pass

    parsed = {
        "merchant": _str("MerchantName") or _str("MerchantAddress"),
        "date": _str("TransactionDate"),
        "total": _num("Total"),
        "tax": _num("TotalTax") or _num("Tax"),
        "tip": _num("Tip"),
        "items": items_out,
    }
    if not parsed["items"]:
        return None
    return parsed

def _azure_read_ocr(image_bytes: bytes) -> Optional[str]:
    if not (AZURE_USE_READ and VISION_CONFIGURED):
        return None

    url = f"{AZURE_VISION_ENDPOINT}/computervision/imageanalysis:analyze?api-version={AZURE_API_VERSION_VISION}&features=read"
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_VISION_KEY,
        "Content-Type": "application/octet-stream",
    }
    try:
        r = requests.post(url, headers=headers, data=image_bytes, timeout=60)
    except requests.RequestException as e:
        print("Azure Read network error:", e)
        return None

    if r.status_code != 200:
        print("Azure Read error", r.status_code, r.text[:300])
        return None

    try:
        data = r.json()
        blocks = data["readResult"]["blocks"]
        lines = []
        for b in blocks:
            for l in b.get("lines", []):
                t = l.get("text", "").strip()
                if t:
                    lines.append(t)
        text = "\n".join(lines).strip()
        return text or None
    except Exception as e:
        print("Azure Read parse error:", e)
        return None

# ---------- OpenAI helpers ----------
_SYSTEM = {
    "role": "system",
    "content": (
        "You are a precise receipt parser. Return ONLY valid JSON (no markdown). "
        "Extract every purchasable line item with its price. "
        "Ignore loyalty/points, cash/change, card metadata, balances, rounding, and headings. "
        "If the receipt is a grocery-style list, you must return many items, not just totals."
    )
}

def _openai_from_image(image_b64: str) -> dict:
    payload = {
        "model": MODEL,
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "messages": [
            _SYSTEM,
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Return ONE JSON object with fields: "
                            "{ merchant?: string, date?: string, total?: number, tax?: number, tip?: number, "
                            "subtotal?: number, items: [{ description: string, amount: number, category?: 'food'|'alcohol'|'appetizer'|'tax'|'tip'|'ignore' }] } "
                            "• Items must be the individual lines (e.g., 'Mizkan Gyoza Sauce 12oz'). "
                            "• subtotal = sum of non-tax/tip items. "
                            "• Use 'alcohol' for beer/wine/liquor; 'appetizer' for common starters; "
                            "use 'tax' or 'tip' only for those lines; otherwise 'food'."
                        )
                    },
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}" }},
                ],
            },
        ],
    }
    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            data=json.dumps(payload), timeout=90,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OpenAI network error: {e}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"OpenAI error ({r.status_code}): {r.text[:800]}")
    try:
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse OpenAI JSON: {e}")

def _openai_from_text(text: str) -> Optional[dict]:
    payload = {
        "model": MODEL,
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "messages": [
            _SYSTEM,
            {
                "role": "user",
                "content": [
                    {"type": "text", "text":
                        "The following is raw OCR from a receipt. Return ONE JSON object with: "
                        "{ merchant?: string, date?: string, total?: number, tax?: number, tip?: number, subtotal?: number, "
                        "items: [{ description: string, amount: number, category?: 'food'|'alcohol'|'appetizer'|'tax'|'tip'|'ignore' }] }. "
                        "Extract EVERY purchasable line that has a price. Ignore loyalty/points/balances."
                    },
                    {"type": "text", "text": text}
                ],
            },
        ],
    }
    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            data=json.dumps(payload), timeout=90
        )
    except requests.RequestException as e:
        print("OpenAI text network error:", e)
        return None

    if r.status_code != 200:
        print("OpenAI text error", r.status_code, r.text[:300])
        return None
    try:
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception:
        return None

# --- Main endpoint ---
@app.post("/analyze-receipt", response_model=AnalyzeResp)
async def analyze(
    request: Request,
    # image inputs
    file: UploadFile | None = File(default=None),
    json_body: AnalyzeReq | None = Body(default=None),

    # knobs via multipart form (preferred on mobile)
    include_tax_tip_form: Optional[bool] = Form(default=None, alias="include_tax_tip"),
    people_form: Optional[int] = Form(default=None, alias="people"),
    tip_percent_form: Optional[float] = Form(default=None, alias="tip_percent"),

    # knobs via query (fallback)
    include_tax_tip_q: Optional[bool] = Query(default=None, alias="include_tax_tip"),
    people_q: Optional[int] = Query(default=None, alias="people"),
    tip_percent_q: Optional[float] = Query(default=None, alias="tip_percent"),
):
    try:
        # ---- normalize knobs ----
        include_tax_tip_in = include_tax_tip_form if include_tax_tip_form is not None else include_tax_tip_q
        include_tax_tip_flag = RESTAURANT_INCLUDE_TAX_TIP_ITEMS if include_tax_tip_in is None else bool(include_tax_tip_in)

        people = people_form if people_form is not None else people_q
        tip_percent = tip_percent_form if tip_percent_form is not None else tip_percent_q

        # basic validation
        if people is not None and (people < 1 or people > 50):
            raise HTTPException(status_code=400, detail="people must be between 1 and 50")
        if tip_percent is not None and (tip_percent < 0 or tip_percent > 100):
            raise HTTPException(status_code=400, detail="tip_percent must be between 0 and 100")

        # ---- read image ----
        if file is not None:
            raw = await file.read()
            image_b64 = _to_b64_jpeg(raw)
        elif json_body is not None and json_body.image_base64:
            image_b64 = json_body.image_base64.strip()
            approx_bytes = (len(image_b64) * 3) // 4
            if approx_bytes > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="Image too large; please send < 10MB")
            try:
                raw = base64.b64decode(image_b64)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 image")
        else:
            raise HTTPException(status_code=400, detail="Provide a 'file' (multipart) or 'image_base64' (JSON).")

        # ---- pipeline ----
        # 1) Azure DI
        parsed = _azure_analyze_receipt(raw)
        if parsed and parsed.get("items"):
            out = _postprocess_receipt(parsed, include_tax_tip_flag, tip_percent_override=tip_percent)
            if len(out["items"]) >= FORCE_SECOND_PASS_MIN_ITEMS:
                out["engine"] = "azure_receipt"
                return AnalyzeResp(**_coerce_amounts(out))

        # 2) Azure Read OCR → GPT
        text = _azure_read_ocr(raw)
        if text:
            parsed_text = _openai_from_text(text)
            if parsed_text and parsed_text.get("items"):
                out = _postprocess_receipt(parsed_text, include_tax_tip_flag, tip_percent_override=tip_percent)
                if len(out["items"]) >= FORCE_SECOND_PASS_MIN_ITEMS:
                    out["engine"] = "azure_read_gpt"
                    return AnalyzeResp(**_coerce_amounts(out))
                # If too few items but OCR looks rich (many prices), try a stricter second pass
                if _looks_like_many_prices(text):
                    parsed_text2 = _openai_from_text(_force_itemization_prompt(text))
                    if parsed_text2 and parsed_text2.get("items"):
                        out2 = _postprocess_receipt(parsed_text2, include_tax_tip_flag, tip_percent_override=tip_percent)
                        out2["engine"] = "azure_read_gpt_strict"
                        return AnalyzeResp(**_coerce_amounts(out2))

        # 3) GPT with image (vision)
        parsed_img = _openai_from_image(image_b64)
        out = _postprocess_receipt(parsed_img, include_tax_tip_flag, tip_percent_override=tip_percent)
        out["engine"] = "gpt_image"
        return AnalyzeResp(**_coerce_amounts(out))

    except HTTPException:
        raise
    except Exception as e:
        print("Analyze fatal error:", repr(e))
        raise HTTPException(status_code=502, detail="Analyzer crashed unexpectedly")

# --- heuristics for second pass ---
_PRICE_RE = re.compile(r"\$?\d{1,3}(?:[,\d]{0,3})?\.\d{2}")

def _looks_like_many_prices(text: str) -> bool:
    # If OCR has many price patterns but the parsed result had <= 1 item, force stricter pass
    return len(_PRICE_RE.findall(text)) >= 6  # tweak as needed

def _force_itemization_prompt(text: str) -> str:
    return (
        "Extract EVERY purchasable line with its price from this OCR. "
        "Return ONLY JSON with fields {subtotal, tax?, tip?, total?, items:[{description, amount, category?}]}. "
        "Ignore points/balance/cash/change/payment. Here is the OCR:\n\n" + text
    )
