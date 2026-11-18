/**
 * The `session` cookie's identity, in one place.
 *
 * A cookie is replaced or deleted only by a Set-Cookie carrying the same name,
 * path and domain — and Chrome will not let a non-Secure write touch a Secure
 * cookie. So the routes that SET it (`routes/login.ts`, `routes/sso.ts`) and
 * the hook that CLEARS a stale one (`server.ts`) have to agree on these
 * attributes exactly, or the clear silently leaves the old cookie in place and
 * the operator is back to "Invalid or missing CSRF token" with nothing to see.
 *
 * `core/flash.ts` reads `cookieSecure()` for the same reason: its cookie is a
 * different name but the same origin, so a deployment that can store one and
 * not the other loses its error banners while login appears to work.
 */
export const SESSION_COOKIE_NAME = 'session'

/**
 * Whether cookies carry `Secure`.
 *
 * Defaults to `NODE_ENV === 'production'`, which is the right answer for any
 * deployment reached over HTTPS — and stays the default so a stock
 * OpenSteward is secure without configuration.
 *
 * `SESSION_COOKIE_SECURE=false` exists for one specific case: serving the
 * admin UI over plain HTTP to somewhere that is not `localhost`, typically
 * another device on a private network. Browsers only store a `Secure` cookie
 * in a secure context, and they treat `localhost` as one but an IP or a
 * `.local` name over HTTP as not. So on that second device the login POST
 * succeeds, the browser silently discards the cookie, and the operator is
 * bounced back to a login page that never explains why.
 *
 * Turning it off means the session cookie — a bearer token for the whole
 * control plane — crosses the network in cleartext. Only reasonable when the
 * transport is private by other means (a VPN or overlay network such as
 * WireGuard, Tailscale or ZeroTier) or the network is one you control
 * entirely. Prefer HTTPS, or a tunnel that puts the far end back on its own
 * `localhost`, over setting this.
 *
 * Read once, at module load: a server's environment does not change while it
 * runs, and evaluating per-request would imply it can.
 */
export function cookieSecure(): boolean {
  const raw = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase()
  if (raw === undefined || raw === '') return process.env.NODE_ENV === 'production'
  // Explicit only, in both directions. An unrecognised value falls back to the
  // default rather than being read as "false" — a typo must not quietly
  // downgrade a production deployment.
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  return process.env.NODE_ENV === 'production'
}

export const SESSION_COOKIE_ATTRIBUTES = {
  path: '/',
  httpOnly: true,
  sameSite: 'strict',
  secure: cookieSecure(),
} as const

/** One day, in seconds. */
export const SESSION_COOKIE_MAX_AGE = 86400
