/**
 * DocuSeal authentication.
 *
 * DocuSeal does not use OAuth. Every request carries a static API key in the
 * `X-Auth-Token` header. The key is generated in the DocuSeal console under
 * Settings → API. The adapter wires this through the Connect Link
 * single-API-key credential form (see `simpleApiKey` in index.ts), which
 * stores the key on `credentials.accessToken`. Self-hosted instances may also
 * supply a `baseUrl`, stored on `credentials.extra.baseUrl`.
 *
 * There is no token to exchange or refresh, so this module only documents the
 * model; the credential form helper handles the (trivial) exchange.
 *
 * Docs: https://www.docuseal.com/docs/api
 */
import type { Credentials } from '@opensteward/shared'

/** Resolve the API key from stored credentials. */
export function resolveApiKey(credentials: Credentials): string {
  const key = credentials.accessToken
  if (!key) throw new Error('DocuSeal: missing API key (X-Auth-Token).')
  return key
}

/** Resolve the API base URL, honouring a self-hosted override on `extra.baseUrl`. */
export function resolveBaseUrl(credentials: Credentials, fallback: string): string {
  const override = credentials.extra?.['baseUrl']
  return typeof override === 'string' && override.length > 0 ? override : fallback
}

// ── Required BaseAdapter auth methods (no OAuth) ─────────────────────────────
//
// DocuSeal authenticates with a static API key, so there is no OAuth flow.
// These satisfy the required interface; credential entry happens through the
// Connect Link single-API-key form (`simpleApiKey`).

const NO_OAUTH = 'DocuSeal uses static API-key auth — no OAuth flow. Use the API-key credential form.'

export function buildAuthUrl(): string {
  throw new Error(NO_OAUTH)
}

export async function exchangeCode(): Promise<Credentials> {
  throw new Error(NO_OAUTH)
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API keys do not expire or refresh.
  return credentials
}
