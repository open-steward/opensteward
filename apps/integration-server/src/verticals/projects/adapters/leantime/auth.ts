/**
 * Leantime authentication — API key.
 *
 * Leantime is self-hosted. Users generate an API key in Company Settings
 * (format: `lt_{username}_{hash}`). There is no OAuth2 authorization-code
 * flow. The Connect Link form collects two fields:
 *   - `baseUrl`  — the caller's Leantime installation URL (e.g. https://pm.acme.com)
 *   - `apiKey`   — the long-lived API key
 *
 * Both are stored in `credentials.extra`; the HTTP client reads them at
 * request time. `credentials.accessToken` is set to the API key so that the
 * standard `BaseAdapter` contract is satisfied.
 */
import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/** Connect Link form has no redirect URL — point users at the API-key docs. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is unused for Leantime. Treat the supplied `code` as
 * `{baseUrl}||{apiKey}` (pipe-separated) so that the Connect Link
 * `exchangeCredentials` shim can forward both fields. If only an API key is
 * provided (legacy), `baseUrl` will be empty.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  const trimmed = (code ?? '').trim()
  const pipeIdx = trimmed.indexOf('||')
  if (pipeIdx !== -1) {
    const baseUrl = trimmed.slice(0, pipeIdx).trim()
    const apiKey = trimmed.slice(pipeIdx + 2).trim()
    return {
      accessToken: apiKey,
      extra: { baseUrl, apiKey },
    }
  }
  // Fallback: treat the whole value as the API key (no base URL).
  return {
    accessToken: trimmed,
    extra: { apiKey: trimmed },
  }
}

/** Leantime API keys are long-lived and do not refresh. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
