/**
 * Fetch one stock photo by provider and id, and return its bytes.
 *
 * **The browser must not fetch these directly.** Hotlinking is refused by some
 * CDNs, CORS by others, and an allowlist belongs somewhere the page cannot
 * edit. So the page sends an id and this route rebuilds the URL.
 *
 * **`?provider=&id=`, never `?url=`.** Taking a URL would make this an open
 * image proxy on a domain people trust — point it at an internal address and it
 * fetches it for you. The id is a number, the host is a constant in this file,
 * and there is no arrangement of query parameters that reaches anywhere else.
 *
 * `PEXELS_API_KEY` is optional. With it the response carries the real
 * photographer; without it the bytes still come back and the id is recoverable
 * attribution. A feature that stops working because a key is missing is worse
 * than one that degrades.
 */

/** Rebuilt server-side. The id is the only thing the caller contributes. */
const PROVIDERS = {
  pexels: {
    // Pexels serves the original at a predictable path once the id is known;
    // the API gives the canonical one when a key is present.
    image: (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`,
    api: (id) => `https://api.pexels.com/v1/photos/${id}`,
    keyEnv: 'PEXELS_API_KEY',
    authHeader: (key) => ({ Authorization: key }),
    credit: (j) => ({
      photographer: (j && j.photographer) || null,
      alt: (j && j.alt) || null,
      image: (j && j.src && (j.src.large2x || j.src.large || j.src.original)) || null,
    }),
  },
  unsplash: {
    image: (id) => `https://images.unsplash.com/photo-${id}`,
    api: (id) => `https://api.unsplash.com/photos/${id}`,
    keyEnv: 'UNSPLASH_ACCESS_KEY',
    authHeader: (key) => ({ Authorization: `Client-ID ${key}` }),
    credit: (j) => ({
      photographer: (j && j.user && (j.user.name || j.user.username)) || null,
      alt: (j && (j.alt_description || j.description)) || null,
      image: (j && j.urls && (j.urls.regular || j.urls.full)) || null,
    }),
  },
};

/** Past this, refuse rather than stream. The panel re-encodes to ~300–600KB
 *  anyway, so anything this large is a mistake or an attack. */
const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // ── Search mode: read-only, JSON, no bytes ────────────────────────────────
  //
  // `?provider=pexels&q=<query>` returns what a query WOULD offer, so a cover
  // decision can be reviewed before anything is stored. It exists because the
  // key lives only in this environment: there is no way to see what a query
  // returns without asking from here.
  //
  // Writes nothing and downloads no image. The per-photo route below is still
  // the only way to obtain bytes.
  if (req.query && req.query.q) {
    const provider = String(req.query.provider || 'pexels').toLowerCase();
    const spec = PROVIDERS[provider];
    if (!spec || provider !== 'pexels') {
      return res.status(400).json({ error: 'search supports pexels only' });
    }
    const key = process.env[spec.keyEnv];
    if (!key) return res.status(503).json({ error: 'no PEXELS_API_KEY configured' });

    const q = String(req.query.q).slice(0, 120);
    const per = Math.min(Math.max(parseInt(String(req.query.per_page || '3'), 10) || 3, 1), 10);
    try {
      const r = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per}`,
        { headers: spec.authHeader(key) });
      if (!r.ok) return res.status(r.status).json({ error: `pexels search ${r.status}` });
      const j = await r.json();
      return res.status(200).json({
        query: q,
        total_results: j.total_results ?? null,
        photos: (j.photos || []).map((p) => ({
          id: p.id,
          alt: p.alt || null,
          photographer: p.photographer || null,
          width: p.width, height: p.height,
          url: p.url || null,
          src: (p.src && (p.src.large2x || p.src.large || p.src.original)) || null,
        })),
      });
    } catch (e) {
      return res.status(502).json({ error: 'pexels search failed' });
    }
  }

  const provider = String((req.query && req.query.provider) || '').toLowerCase();
  const rawId = String((req.query && req.query.id) || '');
  const spec = PROVIDERS[provider];
  if (!spec) return res.status(400).json({ error: 'unknown provider' });

  // Pexels ids are numeric; Unsplash's are an opaque slug of url-safe
  // characters. Neither may contain anything that changes a URL's meaning.
  const id = provider === 'pexels'
    ? (/^\d{1,12}$/.test(rawId) ? rawId : null)
    : (/^[A-Za-z0-9_-]{5,64}$/.test(rawId) ? rawId : null);
  if (!id) return res.status(400).json({ error: 'bad id' });

  // ── Credit, when a key is configured ──────────────────────────────────────
  //
  // Best effort on purpose: a failure here must not cost the image. The API
  // also gives a canonical image URL, which is better than the guessed path.
  let credit = { photographer: null, alt: null, image: null };
  const key = process.env[spec.keyEnv];
  if (key) {
    try {
      const r = await fetch(spec.api(id), { headers: spec.authHeader(key) });
      if (r.ok) credit = spec.credit(await r.json());
    } catch { /* no credit, still an image */ }
  }

  const target = credit.image || spec.image(id);

  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': 'Suna/1.0 (https://app.unaryx.com)' },
    });
    if (!r.ok) return res.status(404).json({ error: 'image not found' });

    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(415).json({ error: 'not an image we accept' });
    }
    const declared = parseInt(r.headers.get('content-length') || '0', 10);
    if (declared && declared > MAX_BYTES) {
      return res.status(413).json({ error: 'image too large' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'image too large' });

    // The credit rides on headers so one request returns both. The body has to
    // be the bytes — the page hands them straight to `reencode()`.
    res.setHeader('Content-Type', type);
    res.setHeader('X-Stock-Provider', provider);
    res.setHeader('X-Stock-Id', id);
    if (credit.photographer) {
      res.setHeader('X-Stock-Photographer', encodeURIComponent(credit.photographer));
    }
    if (credit.alt) res.setHeader('X-Stock-Alt', encodeURIComponent(credit.alt));
    // So the browser can read them cross-fetch.
    res.setHeader('Access-Control-Expose-Headers',
      'X-Stock-Provider, X-Stock-Id, X-Stock-Photographer, X-Stock-Alt');
    return res.status(200).send(buf);
  } catch {
    return res.status(502).json({ error: 'could not fetch that image' });
  }
}
