import type { Credentials } from '../../adapter/interface'
import { NSHIFT_DASHBOARD_URL } from './constants'

/**
 * nShift uses HTTP Basic Authentication.
 *
 * The API key consists of two parts:
 *   - ID (username / first part of combined key)
 *   - Secret (password / second part of combined key)
 *
 * Combined keys look like: <16-char-id>-<24-char-secret>
 * Callers pass either "id:secret" (colon-separated) or the combined key
 * "id-secret" (dash-separated with a 16-char prefix).
 *
 * We store the base64-encoded "id:secret" as the accessToken so every
 * request can send `Authorization: Basic <token>`.
 */

export function buildAuthUrl(_state: string): string {
  return NSHIFT_DASHBOARD_URL
}

/**
 * Accept an API key in one of two formats:
 *   1. "id:secret"      — colon-separated (preferred)
 *   2. "id-secret"      — dash-separated combined key (nShift portal format)
 *
 * Stores base64("id:secret") as the accessToken.
 */
export async function exchangeApiKey(code: string): Promise<Credentials> {
  let id: string
  let secret: string

  if (code.includes(':')) {
    // Explicit colon-separated "id:secret"
    const colonIdx = code.indexOf(':')
    id = code.slice(0, colonIdx)
    secret = code.slice(colonIdx + 1)
  } else if (code.length > 16 && code[16] === '-') {
    // Combined key: first 16 chars = ID, remainder after dash = secret
    id = code.slice(0, 16)
    secret = code.slice(17)
  } else {
    // Fallback: treat entire string as id with empty secret
    id = code
    secret = ''
  }

  const token = Buffer.from(`${id}:${secret}`).toString('base64')
  return { accessToken: token }
}

/**
 * nShift API keys do not expire — return credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
