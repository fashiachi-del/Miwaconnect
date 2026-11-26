# Deploying MiwaConnect on cPanel

MiwaConnect is a **Next.js server application**, not a static site. On cPanel it
must run through **Setup Node.js App** (Phusion Passenger). A plain `public_html`
upload will not work: API routes, server actions and the database queries all
need a running Node process.

## Hard requirements

| Requirement | Why |
| --- | --- |
| **Node.js 20.9 or newer** | Minimum for Next.js 16 |
| **cPanel "Setup Node.js App"** | Starts and supervises the Node process |
| Outbound HTTPS | Neon database and the Miwa Bora price page |
| ~1 GB RAM for the build | `next build` is the memory peak |

> If **Setup Node.js App** is missing from cPanel, the host has not installed
> the Node.js Selector. "Application Manager" alone is not enough to manage a
> Node app. Ask support to enable Node.js hosting, or deploy elsewhere.
> On the current Truehost account this module is **not installed**, which is why
> the subdomain returns 503.

## 1. Create the application

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
| --- | --- |
| Node.js version | 20.x or 22.x |
| Application mode | Production |
| Application root | `miwaconnect` (i.e. `/home/<cpanel-user>/miwaconnect`; an existing root such as `miwaconnect.atihhub.com` is fine) |
| Application URL | `miwaconnect.atihhub.com` |
| Application startup file | `server.js` — **not** `npm start` or `next start` |

Do **not** set `PORT`. Passenger provides it through the environment.

### The Node.js version matters

cPanel accounts often default to an old runtime. If the version dropdown
shows **Node.js 10, 12 or 14**, the app cannot run: Next.js 16 needs **20.9+**.
The symptom is a crash from `next start` before your code loads:

```text
SyntaxError: Unexpected token ?
```

If no 20.x/22.x option exists, ask the host to install Node.js 20 LTS. Changing
files or reinstalling dependencies will not fix a Node 10 runtime.

## 2. Put the code in the application root

Either:

- cPanel → **Git™ Version Control** → clone
  `https://github.com/fashiachi-del/Miwaconnect.git` into the app root, or
- upload a ZIP of the repository and extract it there.

The app root must contain `package.json` and `server.js` directly, not a nested
folder.

## 3. Add environment variables

In the Node.js App screen, add these before building:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon connection string |
| `ADMIN_PIN` | Clerk PIN |
| `PRICES_API_KEY` | Optional; protects the price endpoint |
| `PRICES_REFRESH_TOKEN` | Optional; enables manual refresh |

The price API works without any of the `PRICES_*` variables.

## 4. Install, build, restart

Use **Run JS script** in the Node.js App panel, or the cPanel Terminal:

```bash
cd ~/miwaconnect
source /home/<cpanel-user>/nodevenv/<app-root>/20/bin/activate
node -v                     # must print v20.x or newer
rm -rf node_modules .next   # if the app was previously installed on Node 10
npm install --include=dev   # Tailwind and TypeScript are devDependencies
npm run build
```

Use the exact virtualenv path shown in the Node.js App panel. Then press
**Restart**. `server.js` refuses to serve a missing or stale build rather than
leaving Passenger with a dead process.

`server.js` checks for `.next/BUILD_ID` and exits with a clear message instead
of leaving Passenger with a dead process:

```text
No production build found (.next/BUILD_ID is missing).
```

## 5. SSL and verification

- Run **SSL/TLS Status → Run AutoSSL** after DNS resolves.
- Check:

```bash
curl -I https://miwaconnect.atihhub.com/
curl -I https://miwaconnect.atihhub.com/portal
curl -s https://miwaconnect.atihhub.com/api/sugar-prices | head -c 200
```

Expected: `200` for `/`, `/portal` and the API; `503` only while the app is
stopped or misconfigured.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| **503 Service Unavailable** | No app configured for the domain, app stopped, startup file wrong, or build missing. Check the app's stderr log in cPanel. |
| `No production build found` | `npm run build` was not run in the app root, or it failed. |
| Build fails on Tailwind/TypeScript | `npm install` ran with production-only deps. Use `npm install --include=dev`. |
| `Unsupported Node.js version` | Select Node 20+ in the app settings. |
| `SyntaxError: Unexpected token ?` from `next start` | The app is running Node 10/12/14. Switch the Node.js version to 20+, then reinstall and rebuild. |
| npm warns about a mismatched `node` binary | cPanel is mixing the app virtualenv with the system Node. Activate the virtualenv (step 4) before running npm. |
| Portal 500 but landing page loads | `DATABASE_URL` is missing or wrong; the landing page degrades, the portal needs the DB. |
| App starts then stops immediately | Wrong application root, or `PORT` manually overridden. |
| DNS points somewhere else | The subdomain's A record must target the server that runs the app. |

## Why the current subdomain is down

- `miwaconnect.atihhub.com` exists in the cPanel account.
- Its DNS record points at `sbg108b.truehost.cloud`.
- That server has **no Node.js Selector module** and **no Passenger application**
  registered, so Passenger answers every request with 503.

Hosting this app on that plan requires Truehost to enable Node.js support.
Until then, a Node host (Vercel, Render, Railway or a VPS) is the practical
option; point the subdomain at it with an A or CNAME record.
