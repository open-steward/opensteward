/**
 * Sign.Plus authentication.
 *
 * Sign.Plus does not use OAuth. Every request carries a static API key /
 * Personal Access Token as a Bearer token in the `Authorization` header. The
 * key is minted on the Integrations page in the Sign.Plus account
 * (https://app.sign.plus/profile/integrations). The adapter wires this through
 * the Connect Link single-API-key credential form (see `simpleApiKey` in
 * index.ts), which stores the key on `credentials.accessToken`.
 *
 * There is no token to exchange or refresh, so this module only documents the
 * model; the credential form helper handles the (trivial) exchange.
 *
 * Docs: https://apidoc.sign.plus/get-started/quickstart
 */
import type { Credentials } from '@opensteward/shared'

/** Resolve the API key (Bearer token) from stored credentials. */
export function resolveApiKey(credentials: Credentials): string {
  const key = credentials.accessToken
  if (!key) throw new Error('Sign.Plus: missing API key (Bearer token).')
  return key
}

// ── Required BaseAdapter auth methods (no OAuth) ─────────────────────────────
//
// Sign.Plus authenticates with a static API key, so there is no OAuth flow.
// These satisfy the required interface; credential entry happens through the
// Connect Link single-API-key form (`simpleApiKey`).

const NO_OAUTH =
  'Sign.Plus uses static API-key (Bearer) auth — no OAuth flow. Use the API-key credential form.'

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
