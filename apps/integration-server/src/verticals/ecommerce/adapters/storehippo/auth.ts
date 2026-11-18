/**
 * StoreHippo auth helpers.
 *
 * StoreHippo uses API-key authentication — NOT OAuth. Each store generates
 * an access key in the Dashboard → Developer → API Keys panel.
 *
 * Credentials required:
 *   - `storename`  — the store subdomain, e.g. `mystore` (not `mystore.storehippo.com`)
 *   - `access_key` — the API key from the dashboard
 *
 * These are collected via the Connect Link form (credentialFields /
 * exchangeCredentials) and stored as:
 *   credentials.accessToken    = access_key
 *   credentials.extra.storename = storename
 *
 * Docs: https://help.storehippo.com/api
 */

import type { Credentials } from '@opensteward/shared'

/** Informational URL to direct users to the API-key management page. */
export function buildAuthUrl(storename: string): string {
  const host = storename
    ? `https://${storename}.storehippo.com`
    : 'https://your-store.storehippo.com'
  return `${host}/admin/settings/api`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'StoreHippo does not use OAuth code exchange. ' +
      'Generate an API key in your StoreHippo Dashboard → Developer → API Keys, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "storehippo", credentials: {storename, access_key}}`.',
  )
}
