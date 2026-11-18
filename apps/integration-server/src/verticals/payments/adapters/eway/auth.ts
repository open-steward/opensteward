/**
 * eWAY Rapid uses HTTP Basic auth — not OAuth and not a bearer token.
 *
 * The `Authorization` header value is:
 *
 *   Basic <base64(apiKey + ":" + password)>
 *
 * `apiKey` is the long Rapid API key and `password` is the matching API
 * password; both are generated per-environment in MYeWAY
 * (My Account → Manage API Keys). Because eWAY has separate sandbox and
 * production hosts, the customer also tells us which `environment` the key
 * belongs to. We pre-encode the Basic credential here so the HTTP client can
 * attach the header verbatim, and stash the raw pieces (plus the environment)
 * on `extra` so they survive a refresh round-trip and the client can resolve
 * the correct base URL.
 *
 * Docs: https://eway.io/api-v3/#authentication
 */
import type { Credentials } from '@opensteward/shared'

export function encodeBasic(apiKey: string, password: string): string {
  return Buffer.from(`${apiKey}:${password}`).toString('base64')
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const password = (fields.password ?? '').trim()
  const environment = (fields.environment ?? 'sandbox').trim() || 'sandbox'
  if (!apiKey) throw new Error('eWAY API key is required.')
  if (!password) throw new Error('eWAY API password is required.')
  return {
    accessToken: encodeBasic(apiKey, password),
    extra: { apiKey, password, environment },
  }
}
