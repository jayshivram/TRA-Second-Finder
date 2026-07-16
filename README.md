# TRA Receipt Second Finder

A personal tool to find the missing seconds in a TRA receipt verification
link (`https://verify.tra.go.tz/{CODE}_{HHMMSS}`), when you know the receipt
code, hour, and minute but not the seconds.

## What's in here

- `index.html` — the front end: enter the receipt code/hour/minute, generate
  all 60 possible links, and check them automatically.
- `api/tra-verify.js` — a serverless function that fetches TRA's real
  verification endpoint on your behalf, server-side (no browser CORS
  involved, no public proxy involved).
- `server.js` — optional local dev server, so you can test everything on
  your own machine (`node server.js`) before deploying.
- `vercel.json` — sets a sensible timeout for the serverless function.
- `package.json` — minimal metadata so Vercel recognizes this as a Node
  project.

## How it works

TRA's human-facing URL is just a redirect page. The actual data comes from
`verify.tra.go.tz/Verify/Verified?Secret=HH%3AMM%3ASS`, and that endpoint
expects a `Referer` header pointing back to the redirect URL. The serverless
function replicates that request shape from your own server, then hands the
raw response back to the page, which reads it for TRA's own wording
("START OF LEGAL RECEIPT", "Missing Receipt", etc.) to color-code each second.

The function validates the `link` parameter against a strict pattern before
it will fetch anything, so it can only ever reach a
`https://verify.tra.go.tz/{CODE}_{HHMMSS}`-shaped URL — never an arbitrary
address. It also rate-limits itself (60 requests/minute) and marks every
response `Cache-Control: no-store`, since it's carrying taxpayer data.

## Testing locally first (optional but recommended)

```
node server.js
```

Then open `http://localhost:3000` in your browser. This runs the exact same
`api/tra-verify.js` function Vercel will run, just on your own machine, so
you can confirm everything works before pushing anywhere.

## Pushing to GitHub

From this folder:

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo on GitHub first — via github.com/new — before the
`git push`.)

## Deploying on Vercel

**Option A — from the Vercel dashboard (no CLI needed):**

1. Go to vercel.com and log in (GitHub login works).
2. "Add New..." → "Project" → import the GitHub repo you just pushed.
3. Leave all settings on their defaults (no framework preset needed) and
   click Deploy.
4. Vercel gives you a live URL — that's your working tool, front end and
   proxy included.

Any time you push a new commit to `main`, Vercel redeploys automatically.

**Option B — from the CLI, without GitHub:**

1. Install the Vercel CLI if you don't have it: `npm install -g vercel`
2. From this folder, run: `vercel`
3. Follow the prompts (log in / sign up if needed, accept defaults).
4. Once deployed, open the URL Vercel gives you.

No build step, no framework needed — Vercel auto-detects `index.html` as a
static file and `api/tra-verify.js` as a serverless function.

## Adjusting the rate limit

If 60 checks/minute is too restrictive (or too generous) for how you use it,
change `RATE_LIMIT` near the top of `api/tra-verify.js`.

## Notes

- This is a read-only convenience tool. It doesn't modify, submit, or
  interfere with anything on TRA's system — it only reads publicly
  accessible verification pages, the same way opening the link in a browser
  would.
- Not affiliated with or endorsed by TRA.
