/**
 * Qontak CRM credential form.
 *
 * Qontak's CRM OpenAPI, "A. Authentication": "You can create HMAC username
 * and secret, both is required to create a Authentication token upon a
 * request operation." Its request-header table adds `X-Crm-User-Sso-Id`:
 * "sso_id of user that want to do action." There is no OAuth step, so the
 * three values are entered directly and every request is signed with them
 * (client.ts).
 *
 * Docs: https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

export const QONTAK_HMAC_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'HMAC username',
      type: 'text',
      required: true,
      helpText: 'The HMAC username created in the Mekari Developer Center (developers.mekari.com).',
    },
    {
      name: 'clientSecret',
      label: 'HMAC secret',
      type: 'password',
      required: true,
      helpText: 'The HMAC secret paired with that username.',
    },
    {
      name: 'ssoId',
      label: 'User SSO id',
      type: 'text',
      required: true,
      helpText: 'Sent as X-Crm-User-Sso-Id: the sso_id of the Qontak user the requests act as.',
    },
  ],
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const clientId = (input?.['clientId'] ?? '').trim()
    const clientSecret = (input?.['clientSecret'] ?? '').trim()
    const ssoId = (input?.['ssoId'] ?? '').trim()
    if (!clientId || !clientSecret || !ssoId) {
      throw new Error('Qontak needs the HMAC username, the HMAC secret and the user SSO id.')
    }
    return { accessToken: clientId, extra: { clientId, clientSecret, ssoId } }
  },
})
