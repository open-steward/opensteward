/**
 * OAuth state helpers — in-memory, single-instance. Tracks the
 * `(vertical, platform, tenant)` context for in-flight OAuth flows
 * so the callback handler can route the exchanged credentials back
 * to the right CredentialStore row.
 */
import { createHash, randomBytes } from 'crypto'

export function generateState(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Mint a PKCE verifier/challenge pair (RFC 7636, S256).
 *
 * Required by providers that refuse a plain authorization-code request —
 * ShipBob's IdentityServer answers one with `/home/error?errorId=…`, before
 * any consent screen, so the customer sees a blank platform error with
 * nothing naming the cause.
 *
 * 32 random bytes base64url-encoded is 43 characters, inside RFC 7636's
 * 43–128 range. base64url, not base64: `+/=` are not allowed in the verifier
 * and would be rejected or silently mangled in a query string.
 */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export interface PendingState {
  platform: string
  /**
   * Which vertical the user is connecting to. Required by the unified
   * service so the callback knows which adapter to instantiate; optional
   * in the type for callers whose vertical is fixed by the surrounding
   * context.
   */
  vertical?: string | null
  label?: string | null
  tenantId?: string | null
  redirectUri?: string | null
  /**
   * When set, the OAuth callback will mark the matching connect-session
   * consumed and 302-redirect the customer to `/connect/{token}/done`
   * (or to the session's `redirect_url`) instead of returning the default
   * 201 JSON. Tracks back to a `connect_sessions.id`.
   */
  sessionId?: string | null
  /**
   * PKCE verifier for this flow, when the platform requires PKCE. Minted at
   * authorize time and replayed at token exchange — it never leaves the
   * server, which is the point: the challenge is what travels through the
   * customer's browser.
   */
  codeVerifier?: string | null
  /**
   * Values collected for the adapter's `oauthFields` (Shopify `shop`), when it
   * declares any. Held server-side with the verifier and replayed at exchange;
   * `null` for every adapter that declares none.
   */
  inputs?: Record<string, string> | null
  /**
   * The scope override `getAuthUrl` was handed at authorize (a Connect Link's
   * read-only or custom scopes), replayed to `exchangeCodeWithScopes` for
   * platforms whose token request must repeat the authorize scopes. `null`
   * when the flow had no override.
   */
  grantedScopes?: string[] | null
  expiresAt: Date
}

const pending = new Map<string, PendingState>()

export function storePendingState(
  state: string,
  platform: string,
  options?: {
    vertical?: string | null
    label?: string | null
    tenantId?: string | null
    redirectUri?: string | null
    sessionId?: string | null
    codeVerifier?: string | null
    inputs?: Record<string, string> | null
    grantedScopes?: string[] | null
  },
): void {
  pending.set(state, {
    platform,
    vertical: options?.vertical ?? null,
    label: options?.label ?? null,
    tenantId: options?.tenantId ?? null,
    redirectUri: options?.redirectUri ?? null,
    sessionId: options?.sessionId ?? null,
    codeVerifier: options?.codeVerifier ?? null,
    inputs: options?.inputs ?? null,
    grantedScopes: options?.grantedScopes ?? null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  })
}

/**
 * The `redirect_uri` an adapter's authorize URL carries, or null when it
 * carries none (or the URL does not parse).
 *
 * The token exchange must replay exactly this value (RFC 6749 §4.1.3), and it
 * comes from the adapter's own configured Redirect URI — which need not share
 * the deployment's derived origin (an https-only provider on an otherwise
 * http deployment). Callers store it as the pending `redirectUri` and fall
 * back to the derived callback when this returns null.
 */
export function redirectUriIn(authUrl: string): string | null {
  try {
    return new URL(authUrl).searchParams.get('redirect_uri') || null
  } catch {
    return null
  }
}

export function consumePendingState(state: string): PendingState | null {
  const entry = pending.get(state)
  pending.delete(state)
  if (!entry) return null
  if (entry.expiresAt < new Date()) return null
  return entry
}

/** Returns true if the token is expired or will expire within `bufferMs`. */
export function isTokenExpired(expiresAt: Date | undefined, bufferMs = 60_000): boolean {
  if (!expiresAt) return false
  return Date.now() + bufferMs >= expiresAt.getTime()
}
