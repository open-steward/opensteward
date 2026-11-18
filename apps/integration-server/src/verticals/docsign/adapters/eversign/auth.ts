/**
 * eversign "auth" helpers.
 *
 * eversign has no OAuth flow. The customer supplies a static API key (and
 * optionally a business id) via Connect Link's hosted form
 * (`credentialFields()` → `exchangeCredentials()`). The helpers below
 * exist only so the adapter file layout matches DocuSign one-for-one;
 * they throw on use.
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  _state: string,
): string {
  throw new Error(
    'eversign is an API-key platform — use credentialFields() on the adapter; there is no OAuth URL.',
  )
}

export async function exchangeCode(
  _code: string,
  _redirectUri: string,
  _clientId: string,
  _clientSecret: string,
): Promise<Credentials> {
  throw new Error(
    'eversign does not support authorization-code grant. Submit the API key via Connect Link.',
  )
}

export async function refreshCredentials(
  credentials: Credentials,
  _clientId: string,
  _clientSecret: string,
): Promise<Credentials> {
  // Static API keys do not expire; nothing to refresh.
  return credentials
}
