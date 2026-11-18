/**
 * Leegality auth helpers.
 *
 * Leegality is an API-key platform: a static per-environment Auth Token
 * sent in the `X-Auth-Token` header. There is no OAuth flow, so the OAuth
 * methods throw. Credentials are collected via the Connect Link flow
 * (`credentialFields()` + `exchangeCredentials()`).
 *
 * The customer also picks an environment (production / sandbox) and may
 * supply a Private Salt used for webhook MAC verification. Both are stored
 * on `credentials.extra` so the client + webhook verifier can read them.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export function buildAuthUrl(): string {
  throw new Error(
    'Leegality does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Leegality does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static Auth Token — nothing to refresh.
  return credentials
}

export function leegalityCredentialFields(): CredentialField[] {
  return [
    {
      name: 'authToken',
      label: 'Auth Token',
      type: 'password',
      required: true,
      placeholder: 'Leegality Auth Token',
      helpText:
        'From the dashboard API Settings tab. Sent in the X-Auth-Token header on every request.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'production', label: 'Production' },
        { value: 'sandbox', label: 'Sandbox' },
      ],
      helpText: 'Production and sandbox have separate Auth Tokens and hosts.',
    },
    {
      name: 'privateSalt',
      label: 'Private Salt',
      type: 'password',
      required: false,
      placeholder: 'Leegality Private Salt (optional)',
      helpText:
        'From the API Settings tab. Used to verify webhook authenticity (HMAC-SHA1 of documentId).',
    },
  ]
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const authToken = (fields['authToken'] ?? '').trim()
  if (!authToken) throw new Error('Leegality exchangeCredentials requires field "authToken"')
  const environment = fields['environment'] === 'sandbox' ? 'sandbox' : 'production'
  const baseUrl = environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
  const privateSalt = (fields['privateSalt'] ?? '').trim()
  return {
    accessToken: authToken,
    extra: {
      authType: 'api_key',
      environment,
      baseUrl,
      ...(privateSalt ? { privateSalt } : {}),
    },
  }
}
