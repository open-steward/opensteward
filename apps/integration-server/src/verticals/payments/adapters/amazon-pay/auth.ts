/**
 * Amazon Pay authenticates every request with an RSA signature, not a bearer
 * token (auth_type `api_key` in OpenSteward terms — a secret the merchant
 * pastes into the Connect Link form rather than an OAuth flow).
 *
 * The merchant supplies three values from Seller Central:
 *   - publicKeyId  the id Amazon issued for the uploaded public key
 *   - privateKey   the matching RSA private key (PEM), used to sign requests
 *   - region       na | eu | jp (selects the REST host)
 *
 * We persist these on `credentials.extra`. `accessToken` carries the
 * (non-secret) publicKeyId so the connection has a stable principal; the
 * private key is the secret and is read back by the signing client.
 *
 * Docs: https://developer.amazon.com/docs/amazon-pay-api-v2/signing-requests.html
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_REGION,
  REGION_HOSTS,
  type AmazonPayEnvironment,
  type AmazonPayRegion,
} from './constants'

export interface AmazonPayCredentialExtra {
  publicKeyId: string
  privateKey: string
  region: AmazonPayRegion
  environment: AmazonPayEnvironment
}

const REGION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'na', label: 'North America (pay-api.amazon.com)' },
  { value: 'eu', label: 'Europe / UK (pay-api.amazon.eu)' },
  { value: 'jp', label: 'Japan (pay-api.amazon.jp)' },
]

const ENVIRONMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'sandbox', label: 'Sandbox' },
]

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'publicKeyId',
    label: 'Public Key ID',
    type: 'text',
    required: true,
    helpText:
      'The Public Key ID Amazon issued when you uploaded your public key in Seller Central (e.g. SANDBOX-AHEGSJCM3L2S637RBGABLAFW).',
  },
  {
    name: 'privateKey',
    label: 'Private key (PEM)',
    type: 'password',
    required: true,
    helpText:
      'The RSA private key matching the uploaded public key. Begins -----BEGIN RSA PRIVATE KEY----- (or -----BEGIN PRIVATE KEY-----).',
  },
  {
    name: 'region',
    label: 'Region',
    type: 'select',
    required: true,
    options: REGION_OPTIONS,
    helpText: 'The region your Amazon Pay account is registered in.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: false,
    options: ENVIRONMENT_OPTIONS,
    helpText: 'Use Sandbox for testing; Live for production traffic.',
  },
]

function normaliseRegion(value: string | undefined): AmazonPayRegion {
  return value != null && value in REGION_HOSTS ? (value as AmazonPayRegion) : DEFAULT_REGION
}

function normaliseEnvironment(value: string | undefined): AmazonPayEnvironment {
  return value === 'sandbox' ? 'sandbox' : DEFAULT_ENVIRONMENT
}

/**
 * Validate + pack the Connect Link form fields into `Credentials`. Exposed via
 * `customForm` because Amazon Pay's secret is a multi-field RSA key set rather
 * than a single API key.
 */
export const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const publicKeyId = (fields.publicKeyId ?? '').trim()
    const privateKey = (fields.privateKey ?? '').trim()
    if (!publicKeyId) throw new Error('Public Key ID is required.')
    if (!privateKey) throw new Error('Private key (PEM) is required.')
    const extra: Record<string, unknown> = {
      publicKeyId,
      privateKey,
      region: normaliseRegion(fields.region),
      environment: normaliseEnvironment(fields.environment),
    } satisfies AmazonPayCredentialExtra
    return { accessToken: publicKeyId, extra }
  },
})

/** Read the typed Amazon Pay credential bundle off `credentials.extra`. */
export function readCredentialExtra(credentials: Credentials): AmazonPayCredentialExtra {
  const extra = (credentials.extra ?? {}) as Partial<AmazonPayCredentialExtra>
  const publicKeyId = extra.publicKeyId ?? credentials.accessToken
  if (!publicKeyId) throw new Error('Amazon Pay connection is missing its Public Key ID.')
  if (!extra.privateKey) throw new Error('Amazon Pay connection is missing its private key.')
  return {
    publicKeyId,
    privateKey: extra.privateKey,
    region: normaliseRegion(extra.region),
    environment: normaliseEnvironment(extra.environment),
  }
}
