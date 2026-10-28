# Stage 06 — turning on AI rendering (administrator)

The code is deployed with the site. Until the steps below are done, the "AI დიზაინის გენერაცია" button opens the dialog, and the user can prepare the room, viewpoint, materials and style, but **no request is sent to any AI provider** and nothing is billed.

Everything happens in the **bina** Pages project and the provider consoles. The main lithos.ge site, DNS and other Cloudflare projects are not touched. Do **not** add a `wrangler.toml` to the repository: it would replace the dashboard settings below.

## 1. Accounts and costs you are authorising

| What | Why | Cost |
|---|---|---|
| **OpenAI Platform** API account with billing (platform.openai.com) | primary image model | pay per use; a ChatGPT subscription does **not** include API use |
| OpenAI **organization verification** (if the console asks for it) | may be required for GPT Image models | free |
| *(optional)* **Google AI Studio** API key on a **paid** project | fallback model | pay per use; paid tier so prompts are not used for training |
| **Cloudflare Workers Paid** plan | the Free plan allows 10 ms CPU per request; image payloads of several MB need more (Paid: 30 s default) | $5 / month |
| Cloudflare **D1** database | quotas and spending records | within the Workers plan allowance for this volume |

Rough cost per image, from the official prices, 1536×1024, with the sketch plus 4 material samples (estimates; the real cost is recorded per image):

| Model | low | medium | high |
|---|---|---|---|
| gpt-image-2.5-sunburst / flare | ≈ $0.10 | ≈ $0.14 | ≈ $0.31 |
| gemini-3-pro-image (fallback, 1K/2K) | ≈ $0.17 | ≈ $0.17 | ≈ $0.17 |

Set provider-side limits too: a monthly budget in the OpenAI billing settings, and a budget alert in Google Cloud.

## 2. Create the database

1. Cloudflare dashboard → **Storage & Databases → D1 → Create**. Name it `bina-render`.
2. Optional: open its **Console** and run [`server/render/schema.sql`](../../server/render/schema.sql). The service also creates the table on first use.
3. **Workers & Pages → bina → Settings → Bindings → Add → D1 database**. Set variable name **`BINA_DB`** and database `bina-render`. Do this for **Production** (and Preview, if you test previews).

## 3. Secrets and settings

**Workers & Pages → bina → Settings → Variables and Secrets → Add.** Use **Encrypt** for every row marked secret.

| Name | Value | Secret |
|---|---|---|
| `OPENAI_API_KEY` | the OpenAI key (project key, restricted to Images if possible) | yes |
| `RENDER_SALT` | any long random string (e.g. 32+ characters from a password manager) | yes |
| `RENDER_ACCESS_CODES` | comma-separated codes, one per person allowed to generate, e.g. `sandro-7f3k,client-a-91qz` | yes |
| `RENDER_MONTHLY_BUDGET_USD` | e.g. `20`. Nothing is generated while this is 0 or missing. | no |
| `RENDER_ENABLED` | `true` (set last) | no |

Optional:

| Name | Default | Meaning |
|---|---|---|
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-sunburst` | or `gpt-image-2.5-flare` (faster, same token prices) |
| `RENDER_QUALITY_MAX` | `medium` | highest quality users may pick: `low`, `medium`, `high` |
| `RENDER_MAX_IMAGES` | `1` | images per request (max 4) |
| `RENDER_DAILY_PER_USER` | `3` | per access code per day (UTC) |
| `RENDER_DAILY_TOTAL` | `30` | for the whole service per day |
| `RENDER_RATE_PER_MINUTE` | `2` | per network address |
| `RENDER_MAX_COST_USD` | `0.60` | refuse any single request estimated above this |
| `RENDER_TIMEOUT_MS` | `150000` | provider timeout (10 000–290 000) |
| `RENDER_MAX_UPLOAD_MB` | `4` | request size limit |
| `RENDER_FALLBACK` | `none` | `gemini` to enable the fallback (needs the next two) |
| `GEMINI_API_KEY` | — | secret |
| `GEMINI_IMAGE_MODEL` | `gemini-3-pro-image` | or `gemini-nano-banana-2.1` |
| `RENDER_PUBLIC` | `false` | `true` lets anyone generate without a code (not recommended before accounts exist) |
| `RENDER_ALLOWED_ORIGINS` | bina.lithos.ge, *.bina-csn.pages.dev | browser origins allowed to call the API |

## 4. Runtime settings

**Workers & Pages → bina → Settings → Runtime** (or *Functions → Compatibility*):
- Set the **compatibility date** to today.
- Add the compatibility flag **`enable_request_signal`**. With it, a user's "Cancel" also stops the request to the provider. Without it, the call runs until it finishes or times out; its cost is counted either way.

## 5. Deploy and test

1. Redeploy (merge to `main`, or **Deployments → Retry deployment**). Secrets apply to new deployments only.
2. Open `https://bina.lithos.ge/api/render/config`. Expect `"available": true`. If it says `"reason": "not_configured"`, one of the following is missing: key, budget, salt, `BINA_DB` or codes.
3. In the app: **Materials** → **AI დიზაინის გენერაცია** → confirm → enter an access code → **Generate**.
4. Check spending in D1 → Console:
   `SELECT month, ROUND(SUM(COALESCE(actual_usd, est_usd)),4) usd, COUNT(*) n FROM render_jobs WHERE charged=1 GROUP BY month;`

## How spending is controlled

Every request is checked in this order:
1. Service enabled, with key, budget, salt, database and codes.
2. Allowed origin.
3. Valid access code.
4. Size limits.
5. Valid scene and images.
6. The user's explicit consent (data transfer and age 18+).
7. The user accepted a cost **at least as high as the server's estimate**.
8. The estimate is under `RENDER_MAX_COST_USD`.

The server then **reserves** the estimated cost in D1 with a single atomic statement. That statement checks the monthly budget, the per-user and service daily counts, the per-address rate and one-at-a-time per user. Only then is the provider called.

Afterwards the row gets the real cost from the provider's usage report. Attempts the provider certainly did not bill (bad key, rate limit, invalid request) are released. Timeouts, cancellations and server errors keep their reserved cost, because the provider may have billed them.

## Data and privacy

- **Sent to the provider:** the sketch image, drawn material samples, and text built from room dimensions, openings, furniture types and sizes, and product names and colours. No user names, codes or addresses are sent. OpenAI gets a hashed `safety_identifier`.
- **Stored in D1:** hashed user and address keys, model, size, status, cost and scene revision. No images, prompts or plain addresses.
- **Images:** returned to the browser and saved there (IndexedDB) when the user presses "save". The project file keeps only the record (id, scene revision, model, cost, camera, style).
