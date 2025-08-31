# server.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os, requests, json, time

# --- Config / env ---
load_dotenv()
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("OPENAI_API_KEY is not set. Put it in .env or your environment.")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # override if needed
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")  # "https://yourapp.com,https://*.expo.dev"
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "60"))      # requests per window per IP
RATE_WINDOW_SEC = int(os.environ.get("RATE_WINDOW_SEC", "3600"))
MAX_IMAGE_BASE64_BYTES = int(os.environ.get("MAX_IMAGE_BASE64_BYTES", str(10 * 1024 * 1024)))  # 10MB default

# --- App / CORS ---
app = FastAPI(title="SplitChamp AI Backend", version="1.0.0")
origins = [o.strip() for o in ALLOWED_ORIGINS.split(",")] if ALLOWED_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],  # lock down in prod
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

# --- Healthcheck ---
@app.get("/health")
def health():
    return {"ok": True, "model": MODEL}

# --- Main endpoint ---
@app.post("/analyze-receipt", response_model=AnalyzeResp)
def analyze(req: AnalyzeReq, request: Request):
    # Basic validation
    b64 = (req.image_base64 or "").strip()
    if len(b64) < 10:
        raise HTTPException(status_code=400, detail="image_base64 missing or too short")
    # Approximate size guard: each 4 base64 chars ~3 bytes.
    approx_bytes = (len(b64) * 3) // 4
    if approx_bytes > MAX_IMAGE_BASE64_BYTES:
        raise HTTPException(status_code=413, detail="Image too large; please send < 10MB")

    payload = {
        "model": MODEL,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Extract line items from this receipt. "
                            "Return JSON with: items[{description, amount}], "
                            "and optional total, tax, tip, merchant, date."
                        ),
                    },
                    {"type": "input_image", "image_data": b64},
                ],
            }
        ],
        "text_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "ReceiptExtraction",
                "schema": {
                    "type": "object",
                    "properties": {
                        "merchant": {"type": "string"},
                        "date": {"type": "string"},
                        "total": {"type": "number"},
                        "tax": {"type": "number"},
                        "tip": {"type": "number"},
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {"type": "string"},
                                    "amount": {"type": "number"},
                                },
                                "required": ["description", "amount"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["items"],
                    "additionalProperties": False,
                },
            },
        },
    }

    try:
        r = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {OPENAI_KEY}",
                "Content-Type": "application/json",
            },
            data=json.dumps(payload),
            timeout=90,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OpenAI network error: {e}") from e

    if r.status_code != 200:
        # bubble up OpenAI error text for easier debugging
        detail = r.text[:1000]
        raise HTTPException(status_code=502, detail=f"OpenAI error ({r.status_code}): {detail}")

    try:
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invalid JSON from OpenAI: {e}")

    # Responses API may return a stringified JSON in `output_text`
    if isinstance(data, dict) and "output_text" in data:
        try:
            parsed = json.loads(data["output_text"])
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to parse output_text JSON: {e}")
    else:
        parsed = data

    if not isinstance(parsed, dict) or "items" not in parsed or not isinstance(parsed["items"], list):
        raise HTTPException(status_code=502, detail="OpenAI response missing items[]")

    # Coerce amounts to float
    for it in parsed["items"]:
        try:
            it["amount"] = float(it.get("amount", 0))
        except Exception:
            it["amount"] = 0.0

    return AnalyzeResp(**parsed)
