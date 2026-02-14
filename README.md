# CreativeStudio — Full Website

A professional creative studio website with real payments (Paystack), email notifications, and database storage.

## 📁 Project Structure

```
creativestudio/
├── index.html              ← Main webpage
├── css/
│   └── styles.css          ← All styling
├── js/
│   └── main.js             ← Frontend logic (booking, payments, forms)
├── server/
│   ├── server.js           ← Express backend (API routes)
│   ├── email.js            ← Email sending (Nodemailer)
│   ├── package.json        ← Backend dependencies
│   ├── .env.example        ← Environment variables template
│   └── db/
│       └── database.js     ← SQLite database setup
└── README.md               ← This file
```

## 🚀 Quick Setup (10 minutes)

### Step 1: Install Node.js
Download from [nodejs.org](https://nodejs.org) (LTS version). Verify:
```bash
node --version   # Should show v18+ 
npm --version
```

### Step 2: Install Backend Dependencies
```bash
cd server
cp .env.example .env       # Create your config file
npm install                 # Install packages
```

### Step 3: Configure Environment Variables
Edit `server/.env` with your details:

| Variable | What it is | Where to get it |
|----------|-----------|-----------------|
| `PAYSTACK_SECRET_KEY` | Your Paystack secret key | [dashboard.paystack.com](https://dashboard.paystack.com) → Settings → API Keys |
| `NOTIFY_EMAIL` | Your email for notifications | Your email |
| `SMTP_HOST` | Email server | `smtp.gmail.com` for Gmail |
| `SMTP_USER` | Your email address | Your email |
| `SMTP_PASS` | App password (NOT your regular password) | See Gmail setup below |

### Step 4: Configure Frontend
Edit `js/main.js` — update the CONFIG section at the top:
```javascript
const CONFIG = {
    PAYSTACK_PUBLIC_KEY: 'pk_test_YOUR_KEY_HERE',  // From Paystack dashboard
    API_URL: 'http://localhost:3000/api',           // Your server URL
    CURRENCY: 'GHS',                                // or 'USD'
};
```

### Step 5: Start the Server
```bash
cd server
npm start
```
Open `http://localhost:3000` in your browser!

## 💳 Paystack Setup

1. Create account at [paystack.com](https://paystack.com)
2. Go to **Settings → API Keys**
3. Copy your **Test Public Key** → paste in `js/main.js`
4. Copy your **Test Secret Key** → paste in `server/.env`
5. Go to **Settings → Webhooks** → add URL: `https://yourdomain.com/api/paystack/webhook`

**Testing:** Use Paystack test cards:
- Card: `4084 0840 8408 4081`
- Expiry: any future date
- CVV: `408`

**Going Live:** Replace `pk_test_` with `pk_live_` keys.

## 📧 Gmail Email Setup

1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification → Turn ON
3. Security → App Passwords → Generate one for "Mail"
4. Copy the 16-character password into `SMTP_PASS` in `.env`

## 🔌 What Each Part Does

### Frontend (runs in browser)
| Feature | Status |
|---------|--------|
| Navigation + mobile menu | ✅ Working |
| Hero animations + counters | ✅ Working |
| Portfolio filter | ✅ Working |
| Skill bar animations | ✅ Working |
| Scroll reveal animations | ✅ Working |
| Booking multi-step form | ✅ Working |
| Form validation | ✅ Working |
| Paystack popup payment | ✅ Working (needs your key) |
| Toast notifications | ✅ Working |
| Contact form → API | ✅ Working (needs backend) |
| Newsletter → API | ✅ Working (needs backend) |

### Backend (runs on server)
| Feature | Status |
|---------|--------|
| Contact form storage | ✅ SQLite database |
| Newsletter subscribers | ✅ SQLite database |
| Booking storage | ✅ SQLite database |
| Email to client after payment | ✅ Nodemailer |
| Email to you on new booking | ✅ Nodemailer |
| Email to you on contact form | ✅ Nodemailer |
| Paystack webhook verification | ✅ Signature check |
| Admin endpoints to view data | ✅ /api/admin/* |

## 📡 API Endpoints

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/contact` | Save contact form + email notification |
| POST | `/api/newsletter` | Save newsletter subscriber |
| POST | `/api/bookings` | Save booking after payment |
| POST | `/api/paystack/webhook` | Receive Paystack payment events |
| GET | `/api/admin/bookings` | View all bookings |
| GET | `/api/admin/contacts` | View all contact messages |
| GET | `/api/admin/subscribers` | View all newsletter emails |
| GET | `/api/health` | Server health check |

## 🌐 Deploying to Production

**Option A — VPS (DigitalOcean, Hetzner, etc.)**
1. Upload files to server
2. Install Node.js
3. Run `npm install` in `/server`
4. Use PM2: `npm install -g pm2 && pm2 start server.js`
5. Set up Nginx as reverse proxy
6. Add SSL with Let's Encrypt

**Option B — Railway.app (easiest)**
1. Push to GitHub
2. Connect Railway to your repo
3. Set environment variables in Railway dashboard
4. Deploy — it handles everything

**Option C — Render.com**
1. Push to GitHub
2. Create Web Service on Render
3. Set root directory to `server/`
4. Set build command: `npm install`
5. Set start command: `node server.js`

## ⚠️ Important Notes

- **Never commit `.env`** — it contains secret keys
- **Add authentication** to `/api/admin/*` routes before going live
- The frontend works WITHOUT the backend (forms show helpful messages)
- Database file is auto-created at `server/db/creativestudio.db`
- Paystack webhooks need a publicly accessible URL (use ngrok for local testing)
