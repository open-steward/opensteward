/**
 * Simplicate credential model.
 *
 * Simplicate authenticates via two headers on every request:
 *   Authentication-Key: {API key}
 *   Authentication-Secret: {API secret}
 *
 * Both are generated in the Simplicate account under Settings → API.
 * They are non-expiring; there is no OAuth flow.
 *
 * We store:
 *   credentials.accessToken     → Authentication-Key
 *   credentials.extra.apiSecret → Authentication-Secret
 *   credentials.extra.subdomain → the customer's Simplicate subdomain
 *                                  (e.g. "mycompany" → mycompany.simplicate.nl)
 *
 * Docs: https://developer.simplicate.com/docs/api/v2/getting_started/
 */
import { customForm, type CredentialFormHelper, type Credentials } from '@opensteward/shared'

export const CREDENTIAL_FORM: CredentialFormHelper = customForm({
  fields: [
    {
      name: 'subdomain',
      label: 'Simplicate subdomain',
      type: 'text',
      required: true,
      placeholder: 'yourcompany',
      helpText:
        'The part before ".simplicate.nl" in your Simplicate URL, e.g. "yourcompany".',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Generate API credentials in Simplicate under Settings → API → New.',
    },
    {
      name: 'apiSecret',
      label: 'API secret',
      type: 'password',
      required: true,
      helpText: 'The secret shown alongside the API key in Settings → API.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const subdomain = (fields.subdomain ?? '').trim().toLowerCase()
    const apiKey = (fields.apiKey ?? '').trim()
    const apiSecret = (fields.apiSecret ?? '').trim()
    if (!subdomain) throw new Error('Simplicate subdomain is required.')
    if (!apiKey) throw new Error('API key is required.')
    if (!apiSecret) throw new Error('API secret is required.')
    return {
      accessToken: apiKey,
      extra: {
        apiSecret,
        subdomain,
      },
    }
  },
})
