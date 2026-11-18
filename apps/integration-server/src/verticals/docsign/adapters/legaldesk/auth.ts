/**
 * LegalDesk auth helpers.
 *
 * LegalDesk is an API-key platform: a single API key (issued per account
 * from the LegalDesk dashboard) is sent on every request as the
 * `x-api-key` header. There is no OAuth flow, so the OAuth methods throw.
 * Credentials are collected via the Connect Link flow
 * (`credentialFields()` + `exchangeCredentials()`).
 *
 * The customer also picks an environment (production / sandbox) — each has
 * its own API key + host. The resolved host is stored on
 * `credentials.extra.baseUrl` so the client can read it.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export function buildAuthUrl(): string {
  throw new Error(
    'LegalDesk does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'LegalDesk does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API-key credentials — nothing to refresh.
  return credentials
}

export function legaldeskCredentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      placeholder: 'LegalDesk API key',
      helpText:
        'The API key from the LegalDesk dashboard API settings. Sent in the x-api-key header on every request.',
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
      helpText: 'Production and sandbox have separate API keys and hosts.',
    },
  ]
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = (fields['apiKey'] ?? '').trim()
  if (!apiKey) {
    throw new Error('LegalDesk exchangeCredentials requires field "apiKey"')
  }
  const environment = fields['environment'] === 'sandbox' ? 'sandbox' : 'production'
  const baseUrl = environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
  return {
    accessToken: apiKey,
    extra: {
      authType: 'api_key',
      apiKey,
      environment,
      baseUrl,
    },
  }
}
