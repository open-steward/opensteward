/**
 * Evrotrust auth helpers.
 *
 * The Evrotrust vendor REST API authenticates every request with a static
 * vendor API key plus a vendor number — there is no interactive OAuth flow,
 * so the adapter's `getAuthUrl()` throws and credentials are collected via
 * the Connect Link `credentialFields()` form.
 *
 * Each request carries an `Authorization` header whose value is an
 * HMAC-SHA256 signature of the exact JSON request body, keyed by the
 * SHA-256 hash of the API key, rendered as a lowercase hex string. The
 * vendor number is sent in the request body (`vendorNumber`). We therefore
 * store the API key on `credentials.accessToken` and the vendor number +
 * selected environment base URL on `credentials.extra`.
 *
 * Docs: https://docs.evrotrust.com/reference/overview
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { ENVIRONMENT_BASE_URLS, DEFAULT_BASE_URL } from './constants'

export const EVROTRUST_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'Vendor API key',
    type: 'password',
    helpText:
      'Issued by Evrotrust when your vendor account is provisioned. Used to sign every request (HMAC-SHA256). Treat as a long-lived secret.',
    required: true,
  },
  {
    name: 'vendorNumber',
    label: 'Vendor number',
    type: 'text',
    helpText: 'Your Evrotrust vendor account identifier; sent with every request.',
    required: true,
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    helpText: 'Match the environment your Evrotrust vendor account is provisioned in.',
    required: true,
    options: [
      { value: 'production', label: 'Production (v.evrotrust.com)' },
      { value: 'test', label: 'Test (et.test.iteco.bg)' },
    ],
  },
]

export async function exchangeEvrotrustCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Evrotrust vendor API key is required.')
  const vendorNumber = (fields.vendorNumber ?? '').trim()
  if (!vendorNumber) throw new Error('Evrotrust vendor number is required.')
  const environment = (fields.environment ?? 'production').trim().toLowerCase()
  const baseUrl = ENVIRONMENT_BASE_URLS[environment] ?? DEFAULT_BASE_URL
  return {
    accessToken: apiKey,
    extra: { vendorNumber, environment, baseUrl },
  }
}

export async function refreshEvrotrustCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}
