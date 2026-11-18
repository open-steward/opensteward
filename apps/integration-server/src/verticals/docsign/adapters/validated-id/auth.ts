/**
 * Validated ID (VIDsigner) auth helpers.
 *
 * VIDsigner authenticates every REST call with HTTP Basic using a
 * per-subscription user + password issued by Validated ID. There is no
 * interactive OAuth flow, so `getAuthUrl()` on the adapter throws and
 * credentials are collected via the Connect Link `credentialFields()`
 * form.
 *
 * We pre-compute the Basic token once at exchange time and store it on
 * `credentials.accessToken`; the chosen environment base URL and the
 * subscription user (non-secret, useful for support) live on
 * `credentials.extra`. The password is never persisted in clear text —
 * only the encoded Basic token is kept.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  PRODUCTION_BASE_URL,
  SANDBOX_BASE_URL,
  DEFAULT_BASE_URL,
} from './constants'

export const VALIDATED_ID_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    helpText:
      'Pick "Production" for live signatures or "Pre-production" for the VIDsigner sandbox.',
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Pre-production (sandbox)' },
    ],
  },
  {
    name: 'subscriptionUser',
    label: 'Subscription user',
    type: 'text',
    required: true,
    helpText: 'The VIDsigner subscription user issued by Validated ID.',
  },
  {
    name: 'subscriptionPassword',
    label: 'Subscription password',
    type: 'password',
    required: true,
    helpText: 'The VIDsigner subscription password. Treated as a long-lived secret.',
  },
]

export function baseUrlForEnvironment(environment: string | undefined): string {
  switch ((environment ?? '').trim().toLowerCase()) {
    case 'sandbox':
    case 'pre':
    case 'preprod':
    case 'pre-production':
    case 'preproduction':
      return SANDBOX_BASE_URL
    case 'production':
    case 'prod':
      return PRODUCTION_BASE_URL
    default:
      return DEFAULT_BASE_URL
  }
}

export async function exchangeValidatedIdCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const user = (fields.subscriptionUser ?? '').trim()
  const password = fields.subscriptionPassword ?? ''
  if (!user) throw new Error('VIDsigner subscription user is required.')
  if (!password) throw new Error('VIDsigner subscription password is required.')

  const basicToken = Buffer.from(`${user}:${password}`).toString('base64')
  const baseUrl = baseUrlForEnvironment(fields.environment)

  return {
    accessToken: basicToken,
    extra: {
      baseUrl,
      subscriptionUser: user,
      environment: baseUrl === SANDBOX_BASE_URL ? 'sandbox' : 'production',
    },
  }
}

export async function refreshValidatedIdCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  // Static subscription credentials do not expire; nothing to refresh.
  return credentials
}
