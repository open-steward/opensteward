/**
 * Xodo Sign (formerly eversign) credential handling.
 *
 * Xodo Sign authenticates with a single per-account API access key — there
 * is no OAuth authorization-code dance in this flow. The key is collected
 * via the Connect Link form and stored as `credentials.accessToken`.
 *
 * Every API request is also scoped to a `business_id`. We resolve the
 * account's primary business once at credential-exchange time by calling
 * `GET /business` and stash it on `credentials.extra.businessId` so the
 * client doesn't have to re-resolve it on every call. The customer may
 * optionally override it by typing a Business ID into the form.
 *
 * Docs: https://eversign.com/api/documentation
 */

import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { API_BASE_URL, BUSINESS_PATH } from './constants'

const FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API access key',
    type: 'password',
    required: true,
    helpText:
      'Found in your Xodo Sign account under the top-left dropdown → Developer.',
  },
  {
    name: 'businessId',
    label: 'Business ID (optional)',
    type: 'text',
    required: false,
    helpText:
      'Leave blank to use your primary business. Override only if you operate multiple businesses.',
  },
]

interface RawBusiness {
  business_id?: number | string
  is_primary?: boolean
  name?: string
  [key: string]: unknown
}

/**
 * Resolve the primary business id for an access key. Returns undefined if
 * the lookup fails — the caller falls back to the customer-supplied value.
 */
export async function resolvePrimaryBusinessId(
  accessKey: string,
): Promise<string | undefined> {
  try {
    const { data } = await axios.get<RawBusiness[]>(`${API_BASE_URL}/${BUSINESS_PATH}`, {
      params: { access_key: accessKey },
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
    const businesses = Array.isArray(data) ? data : []
    const primary = businesses.find((b) => b.is_primary) ?? businesses[0]
    return primary?.business_id != null ? String(primary.business_id) : undefined
  } catch {
    return undefined
  }
}

/**
 * The Connect Link credential form. Validates the key, then resolves the
 * primary business id (unless the customer supplied one) so the client is
 * ready to issue scoped requests immediately.
 */
const FORM = customForm({
  fields: FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const apiKey = (input?.['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API access key is required.')
    const supplied = (input?.['businessId'] ?? '').trim()
    const businessId = supplied || (await resolvePrimaryBusinessId(apiKey))
    return {
      accessToken: apiKey,
      extra: businessId ? { businessId } : {},
    }
  },
})

export const credentialFields = FORM.credentialFields
export const exchangeCredentials = FORM.exchangeCredentials
