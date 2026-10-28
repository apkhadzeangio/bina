# Stage 06 — image provider evaluation

Read from the providers' official documentation on **28 October 2026**. Prices and models change; re-check before raising the budget.

## What BINA needs from a model

BINA sends one **layout sketch** (its own 3D view of the room from the chosen camera) and up to 7 **drawn material samples**. It asks for a photorealistic interior that keeps:
- the walls, openings, furniture positions and camera from the sketch
- the chosen finishes

That is an image **edit with several reference images**, not plain text-to-image.

## Candidates

| | OpenAI GPT Image 2.5 (Sunburst / Flare) | Google Gemini image (Nano Banana Pro / 2.1) | Black Forest Labs FLUX 3 |
|---|---|---|---|
| Models (official ids) | `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare` (snapshots `-2026-09-08`). `gpt-image-1` was shut down 23.10.2026. | `gemini-3-pro-image` (Nano Banana Pro), `gemini-nano-banana-2.1`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` | FLUX 3 Image, FLUX 3 Image Klein, FLUX.2 [pro/max/flex] |
| Reference images | Edits endpoint: up to **16** images (`images[]`, file id or data URL) | Up to 14 in total. Pro: **6 object** + 5 character + 3 style refs. 2.1: 10 object + 4 character. | Editing supported; the reference limit is not stated on the pricing page |
| Editing / layout control | Edits endpoint with mask (inpainting). Sunburst is positioned for "workflows where editing precision matters most". | Conversational editing; "thinking" is always on for Gemini 3 image models. Pro is positioned for "the most complex visual tasks". | Image editing supported |
| Output sizes | Any `W×H` divisible by 16, aspect 1:3–3:1, up to 3840×2160 (>2560×1440 experimental). Quality: low → max. | `1K`, `2K`, `4K`; aspect ratios 1:1 … 21:9 incl. 3:2 / 2:3 | 768², 1K, 1.5K, 2K, 4K |
| Price | Per token. Sunburst/Flare: text in $5, image in $8, **image out $30 per 1M** tokens (Batch half). No official per-image table for 2.5. | Pro: **$0.134 per 1K/2K image**, $0.24 per 4K; input image $0.0011; text in $2/1M, text+thinking out $12/1M. 2.1: $0.0336 (1K) / $0.0504 (2K). No free tier for image output. | Per image by resolution (credits, 1 credit = $0.01); exact prices were blank on the fetched page. Responses include each request's `cost`. |
| Latency | Flare ≈ 50 % lower latency than GPT-Image-2; Sunburst "longer generation times" (no figures) | Not stated | Not stated |
| Rate limits | Sunburst, default: Build tier 20 images/min, Launch 150, Grow 250 | Per project; Batch API for volume | — |
| Commercial terms | Business terms: customer **owns all Output**. Customer content is **not used** to develop or improve the services. End-user `safety_identifier` (hashed) recommended. Organization verification may be required for GPT Image models. | Google does **not claim ownership** of generated content. **Paid** services: prompts and responses are not used to improve products (unpaid: they are). Users must be **18+**; API clients must not be directed at or likely used by minors. Georgia is an available region. All images carry a **SynthID** watermark. | FLUX.2 [dev] is non-commercial (no hosted API); terms for the hosted API not reviewed |
| Integration | One JSON POST (`/v1/images/edits`) with data URLs; `usage` returned for exact cost. Bearer key. | `models/{model}:generateContent` (marked *legacy*; a newer Interactions API exists). Inline base64 parts; `x-goog-api-key` header; `usageMetadata` returned. | Async submit + poll |

API access is separate from consumer plans. ChatGPT Plus/Pro and Google AI subscriptions **do not include API usage**: both APIs bill a separate API account (OpenAI Platform and Google AI Studio / Cloud billing).

## Decision

**Primary: OpenAI `gpt-image-2.5-sunburst`** through the Images edits endpoint.
- It takes the most reference images (16): the sketch plus every finish sample fits.
- It is positioned explicitly for precise editing, which is what "keep this layout, change the surfaces" needs.
- Arbitrary output sizes give the exact 3:2 frame the sketch was drawn in (1536×1024).
- The response's `usage` gives the real cost of each image, which BINA records.
- Clear output ownership; no training on API data.
- Administrators can switch to `gpt-image-2.5-flare` (same token prices, faster) with one variable.

**Fallback: Google `gemini-3-pro-image`** (Nano Banana Pro), optional.
- A different company and infrastructure, so an OpenAI outage or overload does not stop the feature.
- A fixed, published per-image price.
- It takes fewer object references (6), so BINA sends the sketch and the 5 most important samples.
- Images carry SynthID, and Google's 18+ requirement is covered by the age confirmation in the dialog.
- BINA uses the fallback only after a retryable provider failure (server error, overload, network), never after a refusal or timeout. It does so only when the fallback's estimate is not higher than the cost the user accepted.

**Not chosen now: FLUX 3.** There was no published per-image price on the fetched page, no stated reference limit, and an asynchronous polling API. It can be added as a third adapter in `server/render/providers.js` once those are known.

## Risks that remain

- **No per-image price for GPT Image 2.5.** BINA estimates with the per-image token counts OpenAI published for gpt-image-1 plus a 25 % margin, and records the real cost from `usage`. The first live renders will show how close the estimate is (see VERIFICATION.md).
- **Layout fidelity is not guaranteed by any provider.** The images are labelled as concepts, and the plan stays the source of truth.
- Gemini's `generateContent` is marked legacy. If Google retires it, the adapter must move to the Interactions API.

## Sources

- OpenAI — [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation), [Create image edit (API reference)](https://developers.openai.com/api/reference/resources/images/methods/edit), [Pricing](https://developers.openai.com/api/docs/pricing), [GPT-Image-2.5 Sunburst model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst.md), [Introducing ChatGPT Images 2.5](https://openai.com/index/introducing-chatgpt-images-2-5/), [Business terms](https://openai.com/policies/business-terms)
- Google — [Image generation (Gemini API)](https://ai.google.dev/gemini-api/docs/image-generation), [generateContent image generation (legacy)](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms), [Available regions](https://ai.google.dev/gemini-api/docs/available-regions)
- Black Forest Labs — [Pricing](https://docs.bfl.ai/quick_start/pricing), [FLUX.2 overview](https://docs.bfl.ai/flux_2/flux2_overview)
- Cloudflare — [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Request.signal / enable_request_signal](https://developers.cloudflare.com/changelog/2025-05-22-handle-request-cancellation/)
