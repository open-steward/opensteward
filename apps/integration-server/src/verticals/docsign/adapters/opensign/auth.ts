/**
 * OpenSign™ auth helpers.
 *
 * OpenSign is an API-token platform: a static token sent in the
 * `x-api-token` header. There is no OAuth flow, so the OAuth methods throw.
 * Credentials are collected via the Connect Link flow (`credentialFields()`
 * + `exchangeCredentials()`).
 *
 * The customer picks a region (production / sandbox / EU) or supplies a
 * self-hosted base URL, and may supply the webhook security key used for
 * HMAC verification. All of these are stored on `credentials.extra` so the
 * client + webhook verifier can read them.
 *
 * Docs: https://docs.opensignlabs.com/docs/help/Settings/APIToken
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  EU_BASE_URL,
  PRODUCTION_BASE_URL,
  SANDBOX_BASE_URL,
} from './constants'

export function buildAuthUrl(): string {
  throw new Error(
    'OpenSign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'OpenSign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API token — nothing to refresh.
  return credentials
}

export function opensignCredentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password',
      required: true,
      placeholder: 'OpenSign API token',
      helpText:
        'Generate one under Settings → API Token. Sent in the x-api-token header on every request.',
    },
    {
      name: 'region',
      label: 'Region',
      type: 'select',
      required: true,
      options: [
        { value: 'production', label: 'Production (US)' },
        { value: 'sandbox', label: 'Sandbox' },
        { value: 'eu', label: 'EU' },
        { value: 'self_hosted', label: 'Self-hosted' },
      ],
      helpText: 'Pick your OpenSign cloud region, or "Self-hosted" to supply your own base URL.',
    },
    {
      name: 'baseUrl',
      label: 'Base URL (self-hosted only)',
      type: 'url',
      required: false,
      placeholder: 'https://opensign.example.com/api/v1.2',
      helpText: 'Only needed when Region is "Self-hosted". Include the /api/v1.2 path.',
    },
    {
      name: 'webhookSecret',
      label: 'Webhook security key',
      type: 'password',
      required: false,
      placeholder: 'OpenSign webhook security key (optional)',
      helpText:
        'From the Webhook settings tab. Used to verify webhook authenticity (HMAC-SHA256, x-webhook-signature header).',
    },
  ]
}

function resolveBaseUrl(region: string, baseUrl: string): string {
  switch (region) {
    case 'sandbox':
      return SANDBOX_BASE_URL
    case 'eu':
      return EU_BASE_URL
    case 'self_hosted':
      return baseUrl.replace(/\/+$/, '')
    case 'production':
    default:
      return PRODUCTION_BASE_URL
  }
}

export async function exchangeApiToken(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = (fields['apiToken'] ?? '').trim()
  if (!apiToken) throw new Error('OpenSign exchangeCredentials requires field "apiToken"')

  const region = fields['region'] || 'production'
  const suppliedBaseUrl = (fields['baseUrl'] ?? '').trim()
  if (region === 'self_hosted' && !suppliedBaseUrl) {
    throw new Error('OpenSign self-hosted region requires a "baseUrl"')
  }
  const baseUrl = resolveBaseUrl(region, suppliedBaseUrl)
  const webhookSecret = (fields['webhookSecret'] ?? '').trim()

  return {
    accessToken: apiToken,
    extra: {
      authType: 'api_key',
      region,
      baseUrl,
      ...(webhookSecret ? { webhookSecret } : {}),
    },
  }
}
