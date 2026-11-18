/**
 * Anvil auth helpers.
 *
 * Anvil does not use OAuth. Authentication is a single per-organization API
 * key sent via HTTP Basic auth (the key is the username, the password is
 * empty). Credentials are collected through the Connect Link credential-form
 * flow (`simpleApiKey` in index.ts), which stores the raw key on
 * `credentials.accessToken`. The OAuth methods below exist only to satisfy
 * the `BaseAdapter` interface and are inert for an API-key platform.
 *
 * Docs: https://www.useanvil.com/docs/api/getting-started/
 */

import type { Credentials } from '@opensteward/shared'

/** Anvil has no OAuth authorize step — the Connect Link API-key form is used. */
export function buildAuthUrl(_state: string): string {
  throw new Error('Anvil uses API-key auth; there is no OAuth authorize URL. Use the credential form.')
}

/** Anvil has no authorization-code exchange. */
export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error('Anvil uses API-key auth; there is no OAuth code exchange. Use exchangeCredentials.')
}

/** API keys are long-lived; nothing to refresh. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
