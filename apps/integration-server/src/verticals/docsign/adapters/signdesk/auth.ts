/**
 * SignDesk (Melento) auth helpers.
 *
 * SignDesk is an API-key platform: an Application ID (entity/tenant
 * identifier) plus a License Key (secret), sent on every request as the
 * `x-application-id` + `x-license-key` headers. There is no OAuth flow, so
 * the OAuth methods throw. Credentials are collected via the Connect Link
 * flow (`credentialFields()` + `exchangeCredentials()`).
 *
 * The customer picks an environment (production / sandbox). Both environments
 * hit the same confirmed API host (api.signdesk.in) with different credential
 * sets. The resolved host is stored on `credentials.extra.baseUrl` so the
 * client can read it; customers who receive a bespoke host from SignDesk can
 * override it by setting `baseUrl` directly.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export function buildAuthUrl(): string {
  throw new Error(
    'SignDesk does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'SignDesk does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API-key credentials — nothing to refresh.
  return credentials
}

export function signdeskCredentialFields(): CredentialField[] {
  return [
    {
      name: 'applicationId',
      label: 'Application ID',
      type: 'text',
      required: true,
      placeholder: 'SignDesk Application ID',
      helpText:
        'Your entity/tenant identifier from the SignDesk dashboard API settings. Sent in the x-application-id header.',
    },
    {
      name: 'licenseKey',
      label: 'License Key',
      type: 'password',
      required: true,
      placeholder: 'SignDesk License Key',
      helpText:
        'The secret License Key from the SignDesk dashboard API settings. Sent in the x-license-key header.',
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
      helpText: 'Production and sandbox have separate Application IDs, License Keys, and hosts.',
    },
  ]
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const applicationId = (fields['applicationId'] ?? '').trim()
  const licenseKey = (fields['licenseKey'] ?? '').trim()
  if (!applicationId) {
    throw new Error('SignDesk exchangeCredentials requires field "applicationId"')
  }
  if (!licenseKey) {
    throw new Error('SignDesk exchangeCredentials requires field "licenseKey"')
  }
  const environment = fields['environment'] === 'sandbox' ? 'sandbox' : 'production'
  const baseUrl = environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
  return {
    accessToken: licenseKey,
    extra: {
      authType: 'api_key',
      applicationId,
      licenseKey,
      environment,
      baseUrl,
    },
  }
}
