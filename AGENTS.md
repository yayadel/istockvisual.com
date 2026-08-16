# iStockVisual agent notes

Content lives on the **Cloudflare Worker** (`https://istockvisual.com`, D1 + R2). Agents generate one asset at a time, then import via HTTP. Do not treat localhost as the catalog.

## Sequential content generation (always)

When making assets (image + meta + import), do **one keyword at a time**. Never batch image prompts or parallel image jobs.

For each asset:

1. Claim **1** keyword and generate meta: `npm run agent:meta` (Gemini) or `npm run agent:meta:gemma` (Together Gemma 4).
2. Generate **one** image from `meta.imagePrompt`. Save the file using `meta.imagePageTitle` (Title Case; strip `<>:"/\|?*`).
3. Import: `node scripts/agent-import.mjs <meta.json> <image.jpg> <keywordId>`
4. Confirm success, then start the next keyword.

Title/tag casing: English title case; acronyms (PDF, UAE, AI, UI, 3D, 4K…) stay uppercase. Titles name the scene, not a search-query sentence. No “Stock Image” / “Free Download” in the title.

If the user asks for N assets, still run N serial loops.

## Cursor Cloud specific instructions

Cloud Agents clone this GitHub repo. There is **no** `.dev.vars` on the VM. Import targets production unless `GENERATE_BASE_URL` is set.

Required **Cursor Dashboard → Cloud Agents → Secrets** (Runtime Secrets, never commit):

| Name | Purpose |
|------|---------|
| `GENERATE_BASE_URL` | Use `https://istockvisual.com` (Environment Variable is fine) |
| `GENERATE_API_SECRET` | Same value as the Worker secret `GENERATE_API_SECRET` (local `.dev.vars` key `GENERATE_API_SECRET_REMOTE`) |
| `GEMINI_API_KEY` | Meta via Gemini |
| `TOGETHER_API_KEY` | Optional; `npm run agent:meta:gemma` |

Do **not** start `astro dev` or Wrangler for content jobs. Do **not** git-commit generated JPEGs or `.tmp` meta unless the user asks. Do **not** open a PR just to import an asset — success is a live page on istockvisual.com.

Default mobile/cloud task: **generate and import exactly 1 asset**, then stop and report the public URL (`/{category}/{slug}`).

If `python3` is required, prefer `python3` then `python`. `npm install` is already in `.cursor/environment.json`.

### Copy-paste prompt (phone)

```
Generate and import exactly 1 stock asset for istockvisual.com.
Follow AGENTS.md: claim one keyword, npm run agent:meta, generate one image from imagePrompt, then agent-import.mjs.
Do not batch. Do not commit images. Do not open a PR. Reply with the live asset URL when import succeeds.
```
