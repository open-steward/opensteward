/**
 * Qoyod auth — API key model.
 *
 * Qoyod issues a single per-business API key from General Settings.
 * There is no OAuth flow; the key is placed directly in the `API-KEY` header.
 * We expose simpleApiKey() so the Connect Link form renders a single password
 * field and stores the key as `credentials.accessToken`.
 */
import type { Credentials } from '../../adapter/interface'

export function getAuthUrl(_state: string): string {
  // No OAuth redirect — instruct the user to paste their API key
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // The "code" is the raw API key submitted via the credential form
  return { accessToken: code.trim() }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is
  return credentials
}
