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

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # vision + JSON mode
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "60"))              # requests per window per IP
RATE_WINDOW_SEC = int(os.environ.get("RATE_WINDOW_SEC", "3600"))  # 1 hour
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
    """
    Uses Chat Completions with JSON mode (stable).
    Sends the image as a data: URL and returns a single JSON object.
    """
    payload = {
        "model": MODEL,                          # e.g., "gpt-4o-mini"
        "response_format": {"type": "json_object"},  # JSON mode
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
                        "image_url": { "url": f"data:image/jpeg;base64,{image_b64}" },
                    },
                ],
            }
        ],
    }

    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
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
        raise HTTPException(status_code=502, detail=f"OpenAI error ({r.status_code}): {r.text[:1200]}")

    try:
        data = r.json()
        content = data["choices"][0]["message"]["content"]  # JSON string (due to JSON mode)
        return json.loads(content)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse JSON: {e}")

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
