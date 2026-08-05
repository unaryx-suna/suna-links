// Recording an itinerary link open.
//
// Ops clause 3.2 pays a creator bonus against verified opens, so this number
// has to survive a creator disputing it. Two design rules follow from that, and
// both are load-bearing:
//
//   1. STORE RAW, COUNT LATER. Nothing is filtered or de-duplicated on write.
//      Every request lands as a row, and "verified open" is a QUERY over the
//      table (see the migration's footer). If we filtered on write and the rule
//      turned out to be wrong, the evidence would be gone; storing raw means
//      the definition can be revised and re-run against history.
//
//   2. NO RAW IP, EVER. The address is hashed with a server-side salt before it
//      leaves this module. `link_opens` has no column that could hold one, and
//      nothing here logs one. De-duplication works on the hash.
//
// Nothing in this file may delay or break the page. Every entry point swallows
// its own errors and returns.

import { createHash } from 'node:crypto';

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';

/**
 * Link-preview crawlers, most specific first.
 *
 * Every one of these fetches the page when someone pastes a link into a chat —
 * a WhatsApp message to one friend can produce several requests before a human
 * sees anything. Exported so the list can be extended without touching the
 * handler, and `rule` is stored on the row so a classification can be audited
 * and corrected later rather than being taken on trust.
 */
export const PREVIEW_BOT_RULES = [
  { rule: 'whatsapp',   pattern: /WhatsApp/i },
  { rule: 'facebook',   pattern: /facebookexternalhit|Facebot/i },
  { rule: 'twitter',    pattern: /Twitterbot/i },
  { rule: 'apple',      pattern: /Applebot/i },
  { rule: 'slack',      pattern: /Slackbot|Slack-ImgProxy/i },
  { rule: 'telegram',   pattern: /TelegramBot/i },
  { rule: 'discord',    pattern: /Discordbot/i },
  { rule: 'linkedin',   pattern: /LinkedInBot/i },
  { rule: 'pinterest',  pattern: /Pinterest/i },
  { rule: 'search',     pattern: /Googlebot|bingbot|DuckDuckBot|YandexBot|Baiduspider/i },
  { rule: 'tooling',    pattern: /curl|wget|python-requests|axios|node-fetch|HeadlessChrome|PhantomJS/i },
  // Deliberately last: it catches things the named rules miss, and being last
  // means a row attributed to it is a prompt to add a specific rule.
  { rule: 'generic',    pattern: /\bbot\b|crawler|spider|preview|scraper/i },
];

/**
 * `{ ua_class, ua_rule }` for a user-agent.
 *
 * Three classes, not two. An absent user-agent is 'unknown' rather than
 * 'human': it is usually tooling, but guessing either way would bake an
 * assumption into data whose whole purpose is to be re-countable.
 */
export function classifyUserAgent(userAgent) {
  const ua = (userAgent || '').trim();
  if (!ua) return { ua_class: 'unknown', ua_rule: 'empty-user-agent' };
  for (const { rule, pattern } of PREVIEW_BOT_RULES) {
    if (pattern.test(ua)) return { ua_class: 'bot', ua_rule: rule };
  }
  return { ua_class: 'human', ua_rule: null };
}

/** First address in the forwarding chain — the client, not the proxies. */
export function clientIP(headers) {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return (headers['x-real-ip'] || '').toString().trim() || null;
}

/**
 * Salted SHA-256 of the address, or null.
 *
 * The salt lives in `OPEN_LOG_SALT` (Vercel env). Without it this returns null
 * and de-duplication degrades to counting every request — which is the correct
 * failure: a raw or unsalted-hashed address must never reach the database, and
 * an unsalted hash of an IPv4 address is trivially reversible by brute force
 * (there are only ~4 billion of them).
 */
export function hashIP(ip, salt) {
  if (!ip || !salt) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

let warnedAboutSalt = false;

/**
 * Writes one row for this request. Never throws.
 *
 * AWAIT THIS, after the response has been sent. It is fire-and-forget from the
 * visitor's point of view — the bytes are already flushed, so nothing here is
 * on their critical path — but a genuinely un-awaited promise is unreliable on
 * Vercel: the runtime may freeze the instance the moment the handler returns,
 * and the insert is silently dropped. Awaiting after `send` keeps the row
 * without costing the visitor anything.
 */
export async function recordOpen({ slug, via, ctx, referrer, userAgent, ip, requestedAt }) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return;              // not configured — never a visible failure

    const salt = process.env.OPEN_LOG_SALT;
    if (!salt && !warnedAboutSalt) {
      warnedAboutSalt = true;
      console.warn('[open-log] OPEN_LOG_SALT is not set — storing ip_hash as null, de-duplication will over-count');
    }

    const { ua_class, ua_rule } = classifyUserAgent(userAgent);

    const row = {
      slug: slug || null,
      via: via || null,
      ctx: ctx || null,
      opened_at: (requestedAt || new Date()).toISOString(),
      referrer: referrer || null,
      user_agent: userAgent || null,
      // Hashed here, so no call site can pass an address through by accident.
      ip_hash: hashIP(ip, salt),
      ua_class,
      ua_rule,
    };

    await fetch(`${SUPABASE_URL}/rest/v1/link_opens`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      // Bounded like the cover probe. A slow database must not hold the
      // function open; a lost row is better than a stuck instance.
      signal: AbortSignal.timeout(2500),
    });
  } catch (error) {
    // Deliberately swallowed and never surfaced to the visitor. A counter that
    // can break a page is worse than a counter with a gap in it.
    console.warn('[open-log] failed to record open:', error?.message || error);
  }
}
