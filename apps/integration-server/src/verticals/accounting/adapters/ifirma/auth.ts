/**
 * iFirma API key authentication.
 *
 * iFirma uses an HMAC-SHA1 scheme — not OAuth. The user supplies:
 *   - login    – their ifirma.pl username
 *   - apiKey   – hex-encoded symmetric key from the ifirma panel
 *
 * Both are stored on `credentials.accessToken` as a JSON string
 * `{ "login": "...", "apiKey": "..." }` so the credential template stores a
 * single opaque token value that downstream code can decode.
 *
 * The `simpleApiKey` template is NOT used here because iFirma needs two
 * fields (login + apiKey). Instead we use `customForm`.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Decode the stored access token back to { login, apiKey }.
 * Returns undefined for either field if the token is unparseable.
 */
export function decodeCredentials(credentials: Credentials): { login: string; apiKey: string } {
  try {
    const parsed = JSON.parse(credentials.accessToken) as { login?: string; apiKey?: string }
    return {
      login: parsed.login ?? '',
      apiKey: parsed.apiKey ?? '',
    }
  } catch {
    return { login: '', apiKey: credentials.accessToken }
  }
}

/**
 * Encode login + apiKey into the single accessToken string.
 */
export function encodeCredentials(login: string, apiKey: string): Credentials {
  return { accessToken: JSON.stringify({ login, apiKey }) }
}

// ── Stubs required by AccountingAdapter / BaseAdapter ─────────────────────────
// iFirma is api_key auth — no OAuth flow.

export function getAuthUrl(_state: string): string {
  throw new Error('iFirma uses API key authentication — OAuth auth URL is not available')
}

export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error('iFirma uses API key authentication — OAuth code exchange is not available')
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API key credentials do not expire; return as-is.
  return credentials
}
