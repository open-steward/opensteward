/**
 * Omnidesk uses HTTP Basic Authentication:
 *   Authorization: Basic base64(staff_email:api_key)
 *
 * Both `subdomain` and `apiKey` are required at credential-setup time;
 * `staffEmail` is also required to form the Basic auth header.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('omnidesk uses HTTP Basic (email + API key) auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'subdomain',
      label: 'Omnidesk subdomain',
      type: 'text',
      required: true,
      helpText: 'The subdomain of your Omnidesk account (e.g. `acme` if your account URL is `acme.omnidesk.ru`).',
    },
    {
      name: 'staffEmail',
      label: 'Staff email',
      type: 'text',
      required: true,
      helpText: 'Email address of the staff account used for API access.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'API key from your Omnidesk account settings.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = fields['subdomain']
  const staffEmail = fields['staffEmail']
  const apiKey = fields['apiKey']
  if (!subdomain) throw new Error('omnidesk: subdomain is required')
  if (!staffEmail) throw new Error('omnidesk: staffEmail is required')
  if (!apiKey) throw new Error('omnidesk: apiKey is required')
  // accessToken stores the base64-encoded Basic credential for convenience
  const accessToken = Buffer.from(`${staffEmail}:${apiKey}`).toString('base64')
  return {
    accessToken,
    extra: { subdomain, staffEmail, apiKey },
  }
}
