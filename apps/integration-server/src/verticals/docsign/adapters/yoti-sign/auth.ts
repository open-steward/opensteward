/**
 * Yoti Sign auth helpers.
 *
 * Yoti Sign uses a static API key sent as an `Authorization: Bearer <API_KEY>`
 * header — there is no interactive OAuth flow, so `getAuthUrl()` /
 * `exchangeCode()` throw and credentials are collected via the Connect Link
 * `credentialFields()` form. The customer also picks which environment
 * (production vs sandbox) the key belongs to, since Yoti issues per-
 * environment keys against distinct hosts.
 *
 * Docs: https://developers.yoti.com/eSignatures/integration-guide
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const YOTI_SIGN_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText:
      'Your Yoti Sign API key, requested from Yoti client support. Sent as a Bearer token; treat as a long-lived secret.',
    required: true,
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    helpText: 'Yoti issues separate keys per environment. Pick the one your key was issued for.',
    required: true,
    options: [
      { value: 'production', label: 'Production (api.yotisign.com)' },
      { value: 'sandbox', label: 'Sandbox (demo.api.yotisign.com)' },
    ],
  },
]

export async function exchangeYotiSignCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Yoti Sign API key is required.')
  const environment = fields.environment === 'sandbox' ? 'sandbox' : 'production'
  return { accessToken: apiKey, extra: { environment } }
}

export async function refreshYotiSignCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  // Static API key — nothing to refresh.
  return credentials
}
