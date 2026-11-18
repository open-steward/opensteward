/**
 * Annature authenticates every request with two headers
 * (https://docs.annature.com.au/api-reference/authentication.md):
 *   "All requests to the Annature API must be authenticated using a pair of
 *   API keys: your **public key** and **private key**."
 *   { "X-Annature-Id": "your-public-key", "X-Annature-Key": "your-private-key" }
 *
 * The private key is stored as `accessToken` (the secret the credential store
 * encrypts and the pager fingerprints), the public key in `extra.publicKey`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('annature uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'publicKey',
      label: 'Public key',
      type: 'text',
      required: true,
      helpText: 'Sent as the X-Annature-Id header.',
    },
    {
      name: 'privateKey',
      label: 'Private key',
      type: 'password',
      required: true,
      helpText: 'Sent as the X-Annature-Key header.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const publicKey = fields['publicKey']
  const privateKey = fields['privateKey']
  if (!publicKey || !privateKey) {
    throw new Error('annature credentialFields require publicKey and privateKey')
  }
  return { accessToken: privateKey, extra: { publicKey } }
}

/** The public key (X-Annature-Id) of a connection; throws when it is missing. */
export function annaturePublicKey(credentials: Credentials): string {
  const publicKey = credentials.extra?.['publicKey']
  if (typeof publicKey !== 'string' || publicKey === '') {
    throw new Error(
      'annature credentials lack the public key (X-Annature-Id); reconnect with publicKey and privateKey',
    )
  }
  return publicKey
}
