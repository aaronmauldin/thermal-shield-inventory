# TSI INV

Mobile-friendly contractor inventory tracker for insulation, caulk, thermostats, fireblock, lightbulbs, and more — with checkout history and low-stock email alerts.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy free on Cloudflare

See **[CLOUDFLARE.md](./CLOUDFLARE.md)** — short version:

```bash
npm run cf-setup
npm run deploy
```

You get a free `*.workers.dev` URL. No domain purchase needed.

## Features

- Track materials with quantity, unit, location, and notes
- Multi-item checkout with employee name
- Checkout history log
- Editable categories
- Low / out-of-stock status
- Email alerts when stock hits your threshold
