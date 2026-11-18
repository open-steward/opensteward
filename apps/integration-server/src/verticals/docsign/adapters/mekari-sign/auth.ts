/**
 * Mekari Sign authentication.
 *
 * Mekari Sign uses Mekari's HMAC API-key scheme rather than interactive
 * OAuth: the customer supplies a Client ID + Client Secret pair (the
 * "api_key"), and every request is signed per-call (see client.ts). There
 * is no token exchange and no refresh — the credentials never expire.
 *
 * The Client ID + Client Secret are carried on `credentials.extra` so the
 * client can re-derive the HMAC signature for each request. `accessToken`
 * holds the Client ID for display/identity purposes only.
 *
 * Docs: https://developers.mekari.com/docs/kb/hmac-authentication
 */

import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

/**
 * Connect Link credential form — Client ID + Client Secret. Both are
 * required to compute the HMAC signature on every call.
 */
export const MEKARI_SIGN_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Found under Manage Applications in the Mekari Developers console.',
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
      helpText: 'The HMAC secret paired with your Client ID.',
    },
  ],
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const clientId = (input?.['clientId'] ?? '').trim()
    const clientSecret = (input?.['clientSecret'] ?? '').trim()
    if (!clientId || !clientSecret) {
      throw new Error('Both Client ID and Client Secret are required.')
    }
    return {
      accessToken: clientId,
      extra: { clientId, clientSecret },
    }
  },
})

/** Mekari Sign has no interactive OAuth authorize step. */
export function buildAuthUrl(_state: string): string {
  return '#'
}

/** No code exchange — the api_key (Client ID/Secret) is supplied directly. */
export async function exchangeCode(code: string): Promise<Credentials> {
  // `code` carries the Client ID when wired through the generic OAuth path;
  // the HMAC secret is supplied via the credential form (exchangeCredentials).
  return { accessToken: code }
}

/** HMAC api-keys do not expire — return credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
