# server.py
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os, requests, json, time, base64

# --- Config / env ---
load_dotenv()
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("OPENAI_API_KEY is not set. Put it in .env or your environment.")

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")  # good for vision + JSON
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "60"))
RATE_WINDOW_SEC = int(os.environ.get("RATE_WINDOW_SEC", "3600"))
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))  # 10MB

# --- App / CORS ---
app = FastAPI(title="SplitChamp AI Backend", version="1.0.0")
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

# --- Healthcheck ---
@app.get("/health")
def health():
    return {"ok": True, "model": MODEL}

# ---- Helpers ----
def _to_b64_jpeg(raw: bytes) -> str:
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large; please send < 10MB")
    return base64.b64encode(raw).decode("utf-8")

def _call_openai(image_b64: str) -> dict:
    # ✅ Use response_format (json_schema) with Responses API
    payload = {
        "model": MODEL,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "ReceiptExtraction",
                "schema": {
                    "type": "object",
                    "properties": {
                        "merchant": {"type": ["string", "null"]},
                        "date": {"type": ["string", "null"]},
                        "total": {"type": ["number", "null"]},
                        "tax": {"type": ["number", "null"]},
                        "tip": {"type": ["number", "null"]},
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {"type": "string"},
                                    "amount": {"type": "number"}
                                },
                                "required": ["description", "amount"],
                                "additionalProperties": False
                            }
                        }
                    },
                    "required": ["items"],
                    "additionalProperties": False
                },
                "strict": True
            }
        },
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You are a precise receipt parser. Extract clear line items with prices, "
                            "and include tax/tip/merchant/date when present. "
                            "Return only JSON that matches the schema."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_data": image_b64,
                        "media_type": "image/jpeg"
                    }
                ],
            }
        ],
        "temperature": 0
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
        detail = r.text[:1200]
        raise HTTPException(status_code=502, detail=f"OpenAI error ({r.status_code}): {detail}")

    try:
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invalid JSON from OpenAI: {e}")

    # Prefer convenience field; otherwise, extract from structured output
    if isinstance(data, dict) and data.get("output_text"):
        try:
            return json.loads(data["output_text"])
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to parse output_text JSON: {e}")

    # Fallback: navigate to text block
    try:
        text = data["output"][0]["content"][0]["text"]
        return json.loads(text)
    except Exception:
        raise HTTPException(status_code=502, detail="Unexpected OpenAI output format")

def _coerce_amounts(parsed: dict) -> dict:
    if not isinstance(parsed, dict) or "items" not in parsed or not isinstance(parsed["items"], list):
        raise HTTPException(status_code=502, detail="OpenAI response missing items[]")
    for it in parsed["items"]:
        try:
            it["amount"] = float(it.get("amount", 0))
        except Exception:
            it["amount"] = 0.0
    return parsed

# --- Main endpoint: accepts EITHER multipart file OR JSON {image_base64} ---
@app.post("/analyze-receipt", response_model=AnalyzeResp)
async def analyze(
    request: Request,
    file: UploadFile | None = File(default=None),
    json_body: AnalyzeReq | None = Body(default=None)
):
    # 1) Get image bytes
    if file is not None:
        raw = await file.read()
        image_b64 = _to_b64_jpeg(raw)
    elif json_body is not None and json_body.image_base64:
        b64 = json_body.image_base64.strip()
        approx_bytes = (len(b64) * 3) // 4  # 4 base64 chars ~ 3 bytes
        if approx_bytes > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image too large; please send < 10MB")
        image_b64 = b64
    else:
        raise HTTPException(status_code=400, detail="Provide a 'file' (multipart) or 'image_base64' (JSON).")

    # 2) Call OpenAI
    parsed = _call_openai(image_b64)
    parsed = _coerce_amounts(parsed)

    # 3) Return normalized shape
    return AnalyzeResp(**parsed)
