/**
 * Karbon API Key auth.
 *
 * Karbon uses TWO static credentials for every request:
 *   Authorization: Bearer <BearerToken>   — obtained from the Karbon developer portal
 *   AccessKey: <AccessKey>                — obtained from Karbon Settings → API Access
 *
 * Neither credential expires, so refreshCredentials is a no-op passthrough.
 * We store the AccessKey in credentials.extra.accessKey so the client can read it.
 */
import type { Credentials } from '../../adapter/interface'
import { customForm } from '@opensteward/shared'

/**
 * Connect-Link form: two fields — Bearer token and AccessKey.
 * We pack both into the Credentials object:
 *   accessToken      = Bearer token (used as Authorization: Bearer <value>)
 *   extra.accessKey  = AccessKey header value
 */
export const KARBON_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'bearerToken',
      label: 'Bearer Token',
      type: 'password' as const,
      required: true,
      helpText: 'Obtain from the Karbon developer portal (developers.karbonhq.com).',
    },
    {
      name: 'accessKey',
      label: 'Access Key',
      type: 'password' as const,
      required: true,
      helpText: 'Obtain from Karbon Settings → API Access.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const bearerToken = (fields['bearerToken'] ?? '').trim()
    const accessKey = (fields['accessKey'] ?? '').trim()
    if (!bearerToken) throw new Error('Bearer Token is required.')
    if (!accessKey) throw new Error('Access Key is required.')
    return { accessToken: bearerToken, extra: { accessKey } }
  },
})

/** No-op: Karbon API keys do not expire. */
export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
