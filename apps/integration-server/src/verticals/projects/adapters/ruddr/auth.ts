/**
 * Ruddr authentication.
 *
 * Ruddr uses long-lived API keys passed as Bearer tokens in the
 * `Authorization` header. There is no OAuth2 authorization-code flow.
 * Keys are valid indefinitely until explicitly revoked and grant full
 * read/write access to all workspace data.
 *
 * Credentials are collected via the `simpleApiKey` Connect Link form
 * (wired in index.ts). The key is stored as `credentials.accessToken`.
 *
 * Docs: https://docs.ruddr.io/guides/authentication
 */
import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/** No OAuth redirect — send the user to the API key help page. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is unused. This passthrough satisfies the
 * `BaseAdapter` contract by treating the code as the raw API key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Ruddr API keys are long-lived and do not expire — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
