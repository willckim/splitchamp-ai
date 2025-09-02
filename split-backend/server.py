# server.py
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os, requests, json, time, base64
from typing import Optional

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

# ---------- Azure (optional) ----------
_raw_endpoint = (os.environ.get("AZURE_ENDPOINT") or "").strip()
AZURE_ENDPOINT = _raw_endpoint.rstrip("/") if _raw_endpoint else ""  # normalize
AZURE_KEY = os.environ.get("AZURE_KEY")

def _to_bool(v: str | None, default: bool = False) -> bool:
    """
    Robust .env boolean parser:
    - Strips whitespace
    - Ignores trailing inline comments (# ...)
    - Accepts true/false/1/0/yes/no/on/off (case-insensitive)
    """
    if v is None:
        return default
    clean = v.strip()
    if "#" in clean:  # remove inline comment: "true   # comment"
        clean = clean.split("#", 1)[0].strip()
    s = clean.lower()
    if s in {"true", "1", "yes", "y", "on"}:
        return True
    if s in {"false", "0", "no", "n", "off"}:
        return False
    return default

AZURE_USE_RECEIPT = _to_bool(os.environ.get("AZURE_USE_RECEIPT"), True)
AZURE_USE_READ    = _to_bool(os.environ.get("AZURE_USE_READ"), True)
RESTAURANT_INCLUDE_TAX_TIP_ITEMS = _to_bool(os.environ.get("RESTAURANT_INCLUDE_TAX_TIP_ITEMS"), True)

AZURE_CONFIGURED = bool(AZURE_ENDPOINT and AZURE_KEY)
AZURE_API_VERSION_DOCS   = "2024-07-31"  # Document Intelligence
AZURE_API_VERSION_VISION = "2024-02-01"  # Vision Image Analysis (Read)

# --- App / CORS ---
app = FastAPI(title="SplitChamp AI Backend", version="1.2.0")
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
    description: str
    amount: float

class AnalyzeResp(BaseModel):
    merchant: str | None = None
    date: str | None = None
    total: float | None = None
    tax: float | None = None
    tip: float | None = None
    items: list[ReceiptItem]
    engine: str | None = None   # which path produced the result

# --- Healthcheck ---
@app.get("/health")
def health():
    azure_on = AZURE_CONFIGURED and (AZURE_USE_RECEIPT or AZURE_USE_READ)
    return {
        "ok": True,
        "model": MODEL,
        "azure_receipt": AZURE_USE_RECEIPT,
        "azure_read": AZURE_USE_READ,
        "azure_configured": AZURE_CONFIGURED,
        "azure_on": azure_on,
    }

@app.get("/")
def root():
    return {"name": "SplitChamp AI Backend", "version": "1.2.0", "health": "/health"}

# ---- Helpers ----
def _to_b64_jpeg(raw: bytes) -> str:
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large; please send < 10MB")
    return base64.b64encode(raw).decode("utf-8")

def _coerce_amounts(parsed: dict) -> dict:
    if not isinstance(parsed, dict) or "items" not in parsed or not isinstance(parsed["items"], list):
        raise HTTPException(status_code=502, detail="Response missing items[]")
    for it in parsed["items"]:
        try:
            it["amount"] = float(it.get("amount", 0))
        except Exception:
            it["amount"] = 0.0
    return parsed

def _postprocess_receipt(d: dict, include_tax_tip: bool) -> dict:
    """
    Restaurant-friendly post-processing:
    - Keep meaningful food/drink line items
    - Merge duplicates
    - Optionally append Tax/Tip as separate items for split toggles
    """
    raw_items = d.get("items") or []
    cleaned: list[dict] = []

    # 1) Clean & filter obvious non-food rows
    skip_tokens = {"SUBTOTAL", "CHANGE", "CASH", "CARD", "BALANCE", "AUTH", "TOTAL"}
    # Note: we do not filter TAX/TIP here; we manage them via top-level fields below.

    for it in raw_items:
        try:
            desc = (it.get("description") or "Item").strip()
            amt = float(it.get("amount") or 0)
            if amt == 0:
                continue
            if desc.upper() in skip_tokens:
                continue
            cleaned.append({"description": desc, "amount": round(amt, 2)})
        except Exception:
            continue

    # 2) Merge duplicates (case-insensitive)
    merged: dict[str, float] = {}
    for it in cleaned:
        k = it["description"].strip().lower()
        merged[k] = round(merged.get(k, 0) + it["amount"], 2)
    items_out = [{"description": k.title(), "amount": v} for k, v in merged.items()]

    # 3) Normalize top-level numbers
    tax = round(float(d.get("tax") or 0), 2)
    tip = round(float(d.get("tip") or 0), 2)
    sum_items = round(sum(x["amount"] for x in items_out), 2)

    total = d.get("total")
    if total is None or not isinstance(total, (int, float)):
        total = round(sum_items + tax + tip, 2)
    else:
        total = round(float(total), 2)
        computed = round(sum_items + tax + tip, 2)
        if abs(total - computed) <= 0.02:
            total = computed

    # 4) Optionally append Tax/Tip as separate line items
    if include_tax_tip:
        if tax > 0:
            items_out.append({"description": "Tax", "amount": tax})
        if tip > 0:
            items_out.append({"description": "Tip", "amount": tip})

    return {
        "merchant": d.get("merchant"),
        "date": d.get("date"),
        "total": total,   # grand total for reference
        "tax": tax,
        "tip": tip,
        "items": items_out,
    }

# ---------- Azure helpers ----------
def _azure_analyze_receipt(image_bytes: bytes) -> dict | None:
    if not (AZURE_CONFIGURED and AZURE_USE_RECEIPT):
        return None

    url = f"{AZURE_ENDPOINT}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version={AZURE_API_VERSION_DOCS}"
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "application/octet-stream",
    }

    try:
        r = requests.post(url, headers=headers, data=image_bytes, timeout=60)
    except requests.RequestException as e:
        print("Azure receipt submit network error:", e)
        return None

    if r.status_code not in (200, 202):
        print("Azure receipt submit error", r.status_code, r.text[:300])
        return None

    op_url = r.headers.get("operation-location") or r.headers.get("Operation-Location")
    if not op_url:
        print("Azure receipt: missing operation-location")
        return None

    result = None
    for _ in range(30):
        try:
            pr = requests.get(op_url, headers={"Ocp-Apim-Subscription-Key": AZURE_KEY}, timeout=30)
        except requests.RequestException:
            time.sleep(1.0)
            continue
        if pr.status_code != 200:
            time.sleep(1.0)
            continue
        data = pr.json()
        status = data.get("status")
        if status in ("succeeded", "failed", "partiallySucceeded"):
            result = data.get("analyzeResult") or data.get("result") or data
            break
        time.sleep(1.0)

    if not isinstance(result, dict):
        return None

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

def _azure_read_ocr(image_bytes: bytes) -> str | None:
    if not (AZURE_CONFIGURED and AZURE_USE_READ):
        return None

    url = f"{AZURE_ENDPOINT}/computervision/imageanalysis:analyze?api-version={AZURE_API_VERSION_VISION}&features=read"
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
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
def _openai_from_image(image_b64: str) -> dict:
    payload = {
        "model": MODEL,
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract line items from this receipt photo and return a SINGLE JSON object "
                            "with fields: { merchant?: string, date?: string, total?: number, tax?: number, "
                            "tip?: number, items: [{ description: string, amount: number }] }. "
                            "Do not include any text outside the JSON."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            }
        ],
    }

    r = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=90,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"OpenAI error ({r.status_code}): {r.text[:1200]}")
    try:
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse JSON: {e}")

def _openai_from_text(text: str) -> dict | None:
    payload = {
        "model": MODEL,
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "messages": [
            {"role": "user", "content": [
                {"type": "text", "text":
                    "The following is raw OCR from a receipt. Return ONE JSON object with: "
                    "{ merchant?: string, date?: string, total?: number, tax?: number, tip?: number, "
                    "items: [{ description: string, amount: number }] }. Only return JSON."
                },
                {"type": "text", "text": text}
            ]}
        ]
    }
    r = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
        data=json.dumps(payload), timeout=90
    )
    if r.status_code != 200:
        return None
    try:
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception:
        return None

# --- Main endpoint: accepts EITHER multipart file OR JSON {image_base64} ---
@app.post("/analyze-receipt", response_model=AnalyzeResp)
async def analyze(
    request: Request,
    file: UploadFile | None = File(default=None),
    json_body: AnalyzeReq | None = Body(default=None),
    include_tax_tip: Optional[bool] = None,  # override env via query param
):
    # 1) Choose restaurant mode for this request
    include_tax_tip_flag = RESTAURANT_INCLUDE_TAX_TIP_ITEMS if include_tax_tip is None else bool(include_tax_tip)

    # 2) Get image bytes + base64
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

    # 3) Try Azure prebuilt receipts first (if enabled)
    parsed = _azure_analyze_receipt(raw)
    if parsed and parsed.get("items"):
        out = _postprocess_receipt(parsed, include_tax_tip_flag)
        out["engine"] = "azure_receipt"
        return AnalyzeResp(**_coerce_amounts(out))

    # 4) Fallback: Azure Read OCR → GPT (text only)
    text = _azure_read_ocr(raw)
    if text:
        parsed_text = _openai_from_text(text)
        if parsed_text and parsed_text.get("items"):
            out = _postprocess_receipt(parsed_text, include_tax_tip_flag)
            out["engine"] = "azure_read_gpt"
            return AnalyzeResp(**_coerce_amounts(out))

    # 5) Final fallback: GPT with image
    parsed_img = _openai_from_image(image_b64)
    out = _postprocess_receipt(parsed_img, include_tax_tip_flag)
    out["engine"] = "gpt_image"
    return AnalyzeResp(**_coerce_amounts(out))
