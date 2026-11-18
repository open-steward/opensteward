/**
 * Lumin Sign "auth" helpers.
 *
 * Lumin Sign has no OAuth authorization-code flow for the api-key model.
 * The customer supplies a static API key (generated under Settings →
 * Developer settings → API keys) via Connect Link's hosted form
 * (`credentialFields()` → `exchangeCredentials()`). The helpers below
 * exist only so the adapter file layout matches the reference adapters
 * one-for-one; the OAuth helpers throw on use and the key never expires.
 *
 * Docs: https://developers.luminpdf.com/tabs/guides/authentication/api-key
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  _state: string,
): string {
  throw new Error(
    'Lumin Sign is an API-key platform — use credentialFields() on the adapter; there is no OAuth URL.',
  )
}

export async function exchangeCode(
  _code: string,
  _redirectUri: string,
  _clientId: string,
  _clientSecret: string,
): Promise<Credentials> {
  throw new Error(
    'Lumin Sign does not support authorization-code grant. Submit the API key via Connect Link.',
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
