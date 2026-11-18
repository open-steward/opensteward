/**
 * Freshservice API-key + subdomain auth.
 *
 * Freshservice uses HTTP Basic Auth with the API key as the username and
 * the literal string 'X' as the password. The combined credential is
 * base64-encoded and sent as:
 *   Authorization: Basic base64("apiKey:X")
 *
 * The subdomain is stored in credentials.extra.subdomain and used to build
 * the per-tenant base URL at request time.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Freshservice uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'subdomain',
      label: 'Freshservice subdomain',
      type: 'text',
      required: true,
      helpText:
        'The subdomain of your Freshservice account (e.g. `acme` for `acme.freshservice.com`).',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Your Freshservice API key. Find it under your profile → API key in Freshservice.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = fields['subdomain']
  const apiKey = fields['apiKey']
  if (!subdomain) throw new Error('Freshservice credentials require subdomain')
  if (!apiKey) throw new Error('Freshservice credentials require apiKey')
  // Store base64-encoded Basic auth token as accessToken
  const token = Buffer.from(`${apiKey}:X`).toString('base64')
  return { accessToken: token, extra: { subdomain } }
}
