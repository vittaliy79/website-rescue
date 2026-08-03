# Website Rescue

A private, local-first CRM for finding and converting businesses with outdated websites. Built with Next.js App Router and TypeScript.

## What it includes

- **Find leads** — search Google Maps for local businesses (dentists, roofers, HVAC, etc.) and import them into the CRM in one click
- **Website analysis** — automatic checks for HTTPS, mobile viewport, CTA, booking, outdated HTML, and more; produces a 0–100 Rescue Score
- Dashboard with pipeline, deal value, outreach, and opportunity metrics
- Lead list with search and status filters
- Add and edit leads, notes, deal values, contact details, and funnel status
- Personalized outreach email generator (uses real analysis findings when available)
- CSV export
- Responsive interface and demonstration data
- Browser-only persistence with `localStorage` — no database or account required

## Run locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first visit loads sample leads. Changes are saved automatically in the current browser.

The **Find leads** feature requires a Google Places API key (see below). The rest of the app works without it.

## Google Places API setup

### 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click **Select a project → New Project**. Give it a name (e.g. `website-rescue`).

### 2. Enable billing

1. In the left menu, go to **Billing**.
2. Link a billing account (credit card required by Google, even for free-tier usage).
3. **Note:** Google provides $200/month of free Maps Platform credit. A normal MVP workload stays well within this, but charges can still occur if you exceed the free tier.

### 3. Enable Places API (New)

1. Go to **APIs & Services → Library**.
2. Search for **Places API (New)** — make sure it is the **(New)** version, not the legacy one.
3. Click **Enable**.

### 4. Create an API key

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → API key**.
3. Copy the generated key.

### 5. Restrict the key (important)

1. Click the key name to open its settings.
2. Under **API restrictions**, choose **Restrict key**.
3. Select **Places API (New)** only.
4. Under **Application restrictions**, choose **None** for a server-side key, or restrict to your server IP if you know it.
5. Click **Save**.

### 6. Add the key locally

Create a `.env.local` file in the project root (it is gitignored):

```
GOOGLE_PLACES_API_KEY=your_api_key_here
```

Restart `npm run dev` after adding it.

### 7. Add the key to Vercel

1. In your Vercel project, go to **Settings → Environment Variables**.
2. Add `GOOGLE_PLACES_API_KEY` with your key value.
3. Redeploy.

**Never use `NEXT_PUBLIC_` prefix.** The key is only used server-side.

### 8. Set daily quotas

1. In Google Cloud, go to **APIs & Services → Places API (New) → Quotas**.
2. Set a **daily request limit** (e.g. 100 requests/day) to cap costs.
3. Also set per-minute limits if needed.

### 9. Enable budget alerts

1. Go to **Billing → Budgets & alerts**.
2. Create a budget (e.g. $10/month).
3. Set alert thresholds at 50%, 90%, and 100%.
4. **Important:** Budget alerts send email notifications but do **not** automatically stop API calls. If you exceed the free tier, charges will continue. To hard-stop spending, disable the API key or set a stricter quota in step 8.

---

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Create a new GitHub repository and upload this project (the contents of this folder, not the ZIP itself).
2. In Vercel, choose **Add New → Project**.
3. Import the GitHub repository.
4. Keep the detected framework as **Next.js** and click **Deploy**.

No environment variables are required.

## MVP privacy and limits

All data is stored only in the browser where it was entered. Clearing site data removes it, and data does not sync between devices. Use **Export CSV** for backups. Before turning this into a multi-user SaaS, add authentication and a database such as Postgres.

The scoring is a manual sales qualification aid; this MVP does not crawl websites or send emails automatically. Those are deliberately left out so it runs without paid services, API keys, or outreach compliance risk.
