/**
 * Proof auth.
 *
 * Proof authenticates with a single API key passed in the `ApiKey` header
 * (see client.ts). There is no OAuth authorization-code redirect flow for
 * the key model, so the Connect Link form collects the key directly via the
 * shared `simpleApiKey` template (wired in index.ts) and the OAuth-shaped
 * BaseAdapter methods below are inert stubs.
 *
 * Docs: https://dev.proof.com/docs/api-keys
 */

import type { Credentials } from '@opensteward/shared'

/** No OAuth redirect — Proof keys are minted in the dashboard. */
export function buildAuthUrl(_state: string): string {
  return 'https://app.proof.com/settings/api'
}

/** The Connect Link form submits the raw key as the "code". */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

/** API keys are long-lived; nothing to refresh. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
