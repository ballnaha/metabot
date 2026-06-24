# 📦 คู่มือติดตั้ง MetaBot

คู่มือนี้อธิบายวิธีติดตั้งโปรเจกต์ MetaBot ตั้งแต่ `git clone` จนถึงเปิดใช้งานได้

---

## สิ่งที่ต้องมีก่อนติดตั้ง (Prerequisites)

| ซอฟต์แวร์ | เวอร์ชัน | หมายเหตุ |
|---|---|---|
| **Windows** | 10 / 11 (64-bit) | MetaTrader5 รองรับเฉพาะ Windows |
| **MetaTrader 5 Terminal** | ล่าสุด | ติดตั้งจาก broker แล้ว login เข้าบัญชี |
| **Python** | **3.10 หรือ 3.11** | ⚠️ **ห้ามใช้ Python 3.12+** เพราะ MetaTrader5 library ยังไม่รองรับ |
| **Node.js** | 20+ | สำหรับ Next.js dashboard |
| **Git** | ล่าสุด | สำหรับ clone โปรเจกต์ |

### 🔑 API Keys ที่ต้องเตรียม (แนะนำ)

- **Deepseek API Key** — สมัครที่ [platform.deepseek.com](https://platform.deepseek.com/api_keys)
- **Gemini API Key** — สมัครที่ [Google AI Studio](https://aistudio.google.com/apikey)
- **Telegram Bot Token** — สร้าง bot ผ่าน [@BotFather](https://t.me/BotFather) แล้วจดเก็บ token
- **Telegram Chat ID** — chat id ของคุณเอง (ใช้ [@userinfobot](https://t.me/userinfobot) หาได้)

---

## ตรวจสอบ Python เวอร์ชัน

```powershell
python --version
```

ถ้าได้ `Python 3.12` ขึ้นไป ต้องติดตั้ง Python 3.11 ก่อน:

```powershell
# ติดตั้งผ่าน winget (เร็วที่สุด)
winget install Python.Python.3.11
```

หรือดาวน์โหลด installer จาก [python.org/downloads/release/python-3119](https://www.python.org/downloads/release/python-3119/)

> ⚠️ ตอนติดตั้ง **ต้องเลือก "Add Python to PATH"**

หลังติดตั้งแล้ว ตรวจสอบว่า Python 3.11 พร้อมใช้:

```powershell
py -3.11 --version
# ควรได้: Python 3.11.x
```

---

## วิธีที่ 1: ติดตั้งอัตโนมัติ (แนะนำ) ⚡

วิธีนี้ง่ายที่สุด — `start.bat` จะจัดการทุกอย่างให้

### ขั้นตอน

```powershell
# 1. Clone โปรเจกต์
git clone https://github.com/ballnaha/metabot.git
cd metabot

# 2. รัน start.bat (ดับเบิลคลิกก็ได้)
start.bat
```

**ครั้งแรก `start.bat` จะทำสิ่งเหล่านี้ให้อัตโนมัติ:**

1. ✅ สร้าง Python virtual environment ใน `backend\.venv`
2. ✅ ติดตั้ง dependencies ทั้งหมดจาก `requirements.txt`
3. ✅ สร้าง `backend\.env` จาก template
4. ✅ รัน `npm install` ให้ frontend
5. ✅ สร้าง `frontend\.env.local` จาก template
6. ✅ เปิด API server + Telegram bot + Dashboard พร้อมกัน

### ⏸️ หลังรันครั้งแรก ให้หยุดแก้ไข config ก่อน

1. **หยุดบริการ** — ปิดหน้าต่าง หรือรัน `stop.bat`
2. **แก้ไข `backend\.env`** — ใส่ค่า MT5, API keys, Telegram (ดูหัวข้อ [ตั้งค่า Environment](#ตั้งค่า-environment))
3. **แก้ไข `frontend\.env.local`** — ให้ `BACKEND_API_KEY` ตรงกับ `API_KEY` ใน backend
4. **รัน `start.bat` อีกครั้ง**

---

## วิธีที่ 2: ติดตั้ง Manual (ทีละขั้น)

### ขั้นตอนที่ 1: Clone โปรเจกต์

```powershell
git clone https://github.com/ballnaha/metabot.git
cd metabot
```

### ขั้นตอนที่ 2: ติดตั้ง Backend

```powershell
cd backend

# สร้าง virtual environment ด้วย Python 3.11
py -3.11 -m venv .venv

# เปิด virtual environment
# CMD:
.venv\Scripts\activate
# PowerShell:
.venv\Scripts\Activate.ps1

# อัพเดต pip
python -m pip install --upgrade pip

# ติดตั้ง dependencies
pip install -r requirements.txt
```

### ขั้นตอนที่ 3: ตั้งค่า Backend Environment

```powershell
# คัดลอกไฟล์ตัวอย่าง
copy .env.example .env

# เปิดแก้ไข
notepad .env
```

### ขั้นตอนที่ 4: ติดตั้ง Frontend

```powershell
cd ..\frontend

# ติดตั้ง dependencies
npm install

# คัดลอกไฟล์ตัวอย่าง
copy .env.local.example .env.local

# แก้ไข BACKEND_API_KEY ให้ตรงกับ API_KEY ใน backend/.env
notepad .env.local
```

### ขั้นตอนที่ 5: รัน Services

เปิด **3 terminal** แยกกัน:

**Terminal 1 — API Server:**

```powershell
cd backend
.venv\Scripts\activate
python run_api.py
# → http://127.0.0.1:8383  (API docs: http://127.0.0.1:8383/docs)
```

**Terminal 2 — Telegram Bot:**

```powershell
cd backend
.venv\Scripts\activate
python run_telegram.py
```

**Terminal 3 — Dashboard:**

```powershell
cd frontend
npm run dev
# → http://localhost:4016
```

---

## ตั้งค่า Environment

### `backend\.env`

| ตัวแปร | ค่า | คำอธิบาย |
|---|---|---|
| `MT5_LOGIN` | *(เว้นว่างได้)* | เลข login MT5 — เว้นว่างถ้าเปิด terminal อยู่แล้ว |
| `MT5_PASSWORD` | *(เว้นว่างได้)* | รหัสผ่าน MT5 |
| `MT5_SERVER` | *(เว้นว่างได้)* | ชื่อ server เช่น `Exness-MT5Trial` |
| `MT5_PATH` | *(เว้นว่างได้)* | path ไปยัง `terminal64.exe` (ถ้าหาเองไม่เจอ) |
| `DEEPSEEK_API_KEY` | `sk-xxx...` | API key ของ Deepseek |
| `GEMINI_API_KEY` | `AIza...` | API key ของ Gemini |
| `AI_PROVIDERS` | `deepseek,gemini` | เลือก AI ที่ต้องการ (เอาออกตัวที่ไม่มี key) |
| `USE_AI` | `true` | `true` = ใช้ AI กรอง / `false` = ใช้แค่ strategy |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC...` | Token จาก @BotFather |
| `TELEGRAM_CHAT_ID` | `987654321` | Chat ID ของคุณ |
| `SYMBOLS` | `EURUSD,GOLD,BTCUSD` | คู่เงินที่อนุญาตให้เทรด |
| `DEFAULT_TIMEFRAME` | `M15` | Timeframe เริ่มต้น |
| `STRATEGY` | `ema_macd_rsi` | Strategy เริ่มต้น |
| `RISK_PER_TRADE` | `0.01` | ความเสี่ยงต่อออเดอร์ (0.01 = 1%) |
| `MAX_LOT` | `1.0` | Lot สูงสุดต่อออเดอร์ |
| `REQUIRE_CONFIRM` | `true` | `true` = ถามก่อนเปิดออเดอร์ / `false` = auto |
| `API_KEY` | `change-me-please` | Secret key สำหรับ API (เปลี่ยนเป็นค่าสุ่ม) |

### `frontend\.env.local`

| ตัวแปร | ค่า | คำอธิบาย |
|---|---|---|
| `BACKEND_URL` | `http://127.0.0.1:8383` | URL ของ backend API |
| `BACKEND_API_KEY` | `change-me-please` | **ต้องตรงกับ** `API_KEY` ใน backend |

---

## ตั้งค่า MetaTrader 5 Terminal

ก่อนใช้ bot เทรดได้ ต้องเปิดการตั้งค่าใน MT5:

1. เปิด MetaTrader 5
2. ไปที่ **Tools → Options → Expert Advisors**
3. ✅ เลือก **"Allow Algo Trading"**
4. กด OK

> 💡 **แนะนำ:** เริ่มต้นด้วย **บัญชี Demo** ก่อนเสมอ

---

## โครงสร้างโปรเจกต์

```
metabot/
├─ start.bat              # รันทุก service ด้วยคลิกเดียว
├─ stop.bat               # หยุดทุก service
├─ backend/
│  ├─ app/
│  │  ├─ config.py        # อ่านค่าจาก .env
│  │  ├─ models.py        # Pydantic models
│  │  ├─ mt5_client.py    # เชื่อมต่อ MetaTrader 5
│  │  ├─ indicators.py    # RSI / MACD / EMA / ATR / Bollinger
│  │  ├─ strategy.py      # Pluggable strategies
│  │  ├─ advisor.py       # Deepseek + Gemini AI advisor
│  │  ├─ trader.py        # วิเคราะห์ → confirm → เปิดออเดอร์
│  │  ├─ api.py           # FastAPI endpoints
│  │  └─ telegram_bot.py  # Telegram interface
│  ├─ run_api.py          # เริ่ม API server
│  ├─ run_telegram.py     # เริ่ม Telegram bot
│  ├─ requirements.txt    # Python dependencies
│  ├─ .env.example        # ตัวอย่างไฟล์ config
│  └─ .env                # ← config จริง (ไม่อยู่ใน git)
└─ frontend/
   ├─ app/
   │  ├─ page.tsx         # หน้า dashboard
   │  └─ api/[...path]/route.ts  # proxy ไป backend
   ├─ package.json
   ├─ .env.local.example  # ตัวอย่างไฟล์ config
   └─ .env.local          # ← config จริง (ไม่อยู่ใน git)
```

---

## หยุดบริการ

```powershell
# วิธีที่ 1: ดับเบิลคลิก
stop.bat

# วิธีที่ 2: ปิดหน้าต่าง terminal
```

---

## แก้ปัญหาที่พบบ่อย (Troubleshooting)

### ❌ `MetaTrader5` ติดตั้งไม่ได้ / Encountered error while generating package metadata

**สาเหตุ:** ใช้ Python 3.12+ ซึ่ง MetaTrader5 ไม่รองรับ

```powershell
# ตรวจสอบเวอร์ชัน
python --version

# ถ้าได้ 3.12+ ให้ติดตั้ง 3.11
winget install Python.Python.3.11

# สร้าง venv ใหม่ด้วย Python 3.11
cd backend
rmdir /s /q .venv
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### ❌ `Could not find a version that satisfies the requirement MetaTrader5==x.x.x`

**สาเหตุ:** เวอร์ชันที่ระบุใน `requirements.txt` ไม่มีใน PyPI

```powershell
# ดูเวอร์ชันที่มี
pip install MetaTrader5==0.0.0
# จะแสดง list เวอร์ชันทั้งหมด — เลือกตัวล่าสุด

# แก้ไข requirements.txt ให้ตรงเวอร์ชัน
```

### ❌ MT5 เชื่อมต่อไม่ได้ (initialize failed)

1. ตรวจสอบว่า **MetaTrader 5 terminal เปิดอยู่** และ login แล้ว
2. ตรวจสอบว่าเปิด **Allow Algo Trading** แล้ว
3. ถ้าใส่ `MT5_LOGIN` / `MT5_PASSWORD` / `MT5_SERVER` ใน `.env` — ตรวจสอบให้ถูกต้อง
4. ถ้ามี MT5 หลายตัว ให้ระบุ `MT5_PATH` ชี้ไปยัง `terminal64.exe` ที่ถูกตัว

### ❌ Dashboard เปิดไม่ได้ / API error

1. ตรวจสอบว่า backend API รันอยู่ที่ `http://127.0.0.1:8383`
2. ตรวจสอบว่า `BACKEND_API_KEY` ใน `frontend\.env.local` **ตรงกับ** `API_KEY` ใน `backend\.env`
3. ลอง restart ทุก service

### ❌ Telegram bot ไม่ตอบ

1. ตรวจสอบ `TELEGRAM_BOT_TOKEN` ถูกต้อง
2. ตรวจสอบ `TELEGRAM_CHAT_ID` เป็น chat id ของคุณ (ไม่ใช่ username)
3. ตรวจสอบว่า **กด Start ที่ bot ใน Telegram แล้ว**

---

## URLs หลังรันสำเร็จ

| Service | URL |
|---|---|
| API Server | [http://127.0.0.1:8383](http://127.0.0.1:8383) |
| API Docs (Swagger) | [http://127.0.0.1:8383/docs](http://127.0.0.1:8383/docs) |
| Dashboard | [http://localhost:4016](http://localhost:4016) |
| Telegram Bot | ค้นหา bot ของคุณใน Telegram |
