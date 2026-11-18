/**
 * Lago auth — a single organisation API key sent as a Bearer token.
 *
 * Lago has no OAuth flow and no token refresh. The customer creates an API
 * key in the Lago dashboard (Developers → API keys). The key scopes a single
 * organisation; the host (`baseUrl`) distinguishes cloud regions / self-hosted
 * instances and is stored on `credentials.extra` so the client can rebuild the
 * base URL on every call.
 *
 * Docs: https://getlago.com/docs/api-reference/api-standards
 */
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/**
 * Build canonical `Credentials` from the submitted Connect Link form fields.
 * `apiKey` → bearer token; optional `baseUrl` (cloud region or self-hosted
 * origin) is persisted on `extra` and defaults to the US cloud host.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const baseUrl = (fields.baseUrl ?? '').trim() || API_BASE_URL
  return {
    accessToken: apiKey,
    extra: { baseUrl: baseUrl.replace(/\/+$/, '') },
  }
}

/** Resolve the configured API origin for a connection (defaults to US cloud). */
export function resolveBaseUrl(credentials: Credentials): string {
  const fromExtra = credentials.extra?.['baseUrl']
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.replace(/\/+$/, '')
  }
  return API_BASE_URL
}
