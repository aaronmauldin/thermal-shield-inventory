# Deploy TSI INV on Cloudflare (simple)

You get a free URL like `tsi-inv.yourname.workers.dev`. No domain purchase needed.

## One-time setup

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com)
2. In this project folder, run:

```bash
npm install
npm run cf-setup
```

That logs you into Cloudflare and creates free KV storage for inventory data.

3. Deploy:

```bash
npm run deploy
```

4. Open the URL Wrangler prints at the end.

## Optional: email alerts on Cloudflare

SMTP from Gmail settings does not work well on Cloudflare. Easiest free option:

1. Create a free [Resend](https://resend.com) account
2. Copy your API key
3. In Cloudflare dashboard → your Worker (`tsi-inv`) → **Settings** → **Variables**
4. Add:
   - `RESEND_API_KEY` = your key
   - `RESEND_FROM` = `TSI INV <onboarding@resend.dev>` (works for testing)
5. Redeploy: `npm run deploy`
6. In the app **Settings**, set your alert email and save

## Optional: phone push alerts (Home Screen app)

Works on phones that saved TSI INV to the Home Screen (required on iPhone).

1. Generate VAPID keys once: `npx @pushforge/builder vapid`
2. Add Worker secrets (or local `.dev.vars`):
   - `VAPID_PUBLIC_KEY` = the public key string
   - `VAPID_PRIVATE_KEY` = the full private JWK JSON (one line)
   - `VAPID_SUBJECT` = `mailto:you@example.com`
3. Redeploy: `npm run deploy`
4. On your phone: open the live URL → Share → **Add to Home Screen** → open TSI INV from the icon → **Settings** → **Enable phone alerts**
5. Use **Send test alert** (needs at least one low/out item) to verify

Push fires when stock is checked out / adjusted and hits low or out (same path as email).

## Local development

```bash
npm run dev
```

Still uses the local `data/inventory.json` file on your computer.

## Jobber (upcoming job material estimates)

1. Create an app at [developer.getjobber.com](https://developer.getjobber.com/)
2. Set the OAuth callback URL to:
   `https://tsi-inv.YOURSUBDOMAIN.workers.dev/api/jobber/callback`
   (local: `http://localhost:3000/api/jobber/callback`)
3. Request scopes that can read jobs / line items
4. Add Worker variables (or local `.dev.vars`):
   - `JOBBER_CLIENT_ID`
   - `JOBBER_CLIENT_SECRET`
   - `JOBBER_REDIRECT_URI` (optional; defaults to `{origin}/api/jobber/callback`)
5. Redeploy, then in the app open **More → Line item templates** and create templates whose **names match Jobber line items**
6. Open **More → Upcoming material** and click **Connect Jobber**

Templates and inventory stay in KV when you redeploy. Jobber tokens are stored in the same inventory data blob.

## Later (optional)

Connect `inventory.your-wix-domain.com` in Cloudflare → Workers → Custom domains.
