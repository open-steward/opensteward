/**
 * Lleida.net Click & Sign auth helpers — API key only.
 *
 * Click & Sign authenticates with a static API key sent in the
 * `Authorization: x-api-key <key>` header. Every request body must also
 * carry the account `user` (the Lleida.net login), so the credential form
 * collects both. There is no OAuth Authorization-Code flow for
 * server-to-server use, so `getAuthUrl`/`exchangeCode` are unsupported.
 *
 * We use the shared `customForm` template (rather than `simpleApiKey`) so the
 * form can also capture the `user`, which is stored on `credentials.extra.user`
 * for the client to inject into each request body.
 *
 * Docs: https://api.lleida.net/dtd/common/v1/en/index.html#authentication
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

export const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Click & Sign API key',
      type: 'password',
      placeholder: 'Your Lleida.net API key',
      helpText:
        'In the Lleida.net back office, open the API section and copy your API key. The adapter sends it as the "Authorization: x-api-key <key>" request header.',
      required: true,
    },
    {
      name: 'user',
      label: 'Account user',
      type: 'text',
      placeholder: 'your-lleida-username',
      helpText: 'Your Lleida.net account username. It is included in every request body as the "user" field.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields.apiKey ?? '').trim()
    if (!apiKey) throw new Error('Click & Sign API key is required.')
    const user = (fields.user ?? '').trim()
    if (!user) throw new Error('Account user is required.')
    return {
      accessToken: apiKey,
      extra: { user },
    }
  },
})
