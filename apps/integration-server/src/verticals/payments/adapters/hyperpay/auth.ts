/**
 * HyperPay (OPPWA) authenticates every API call with a Bearer **access token**
 * sent in the `Authorization` header. Every request is additionally scoped to an
 * **entityId** (the channel/division/merchant identifier the token is issued
 * against). There is no OAuth flow — both values are issued from the HyperPay
 * back office and submitted through the Connect Link form.
 *
 * Because the entityId is required on every call (and is not part of the access
 * token), a single API-key field is not enough; we collect both via the shared
 * `customForm` template and stash the entityId on `credentials.extra` so the
 * client can append it to each request.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

/** Read the connect-time entityId back off stored credentials. */
export function getEntityId(credentials: Credentials): string {
  const entityId = credentials.extra?.['entityId']
  return typeof entityId === 'string' ? entityId : ''
}

export const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Access token',
      type: 'password',
      required: true,
      helpText:
        'Bearer access token from the HyperPay back office (Administration → Account Data). ' +
        'A test token only works against the sandbox host; a live token against production.',
    },
    {
      name: 'entityId',
      label: 'Entity ID',
      type: 'text',
      required: true,
      placeholder: '8a8294…',
      helpText:
        'Channel (entity) identifier the access token is issued against. Sent on every request.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const accessToken = (fields['accessToken'] ?? '').trim()
    const entityId = (fields['entityId'] ?? '').trim()
    if (!accessToken) throw new Error('Access token is required.')
    if (!entityId) throw new Error('Entity ID is required.')
    return { accessToken, extra: { entityId } }
  },
})
