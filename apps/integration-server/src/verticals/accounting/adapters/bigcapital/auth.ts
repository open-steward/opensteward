/**
 * Bigcapital uses API key authentication.
 *
 * Keys are prefixed `bc_` and passed as a Bearer token:
 *   Authorization: Bearer bc_xxxxxxxxx
 *
 * Bigcapital is primarily self-hosted open-source software. For self-hosted
 * instances, customers supply their own base URL. The cloud offering at
 * api.bigcapital.com is used as the fallback when no URL is provided.
 *
 * The base URL is stored in `credentials.extra.baseUrl`; the API key is stored
 * as `credentials.accessToken` so the client can attach it directly.
 */
import { customForm } from '@opensteward/shared'

export const BIGCAPITAL_AUTH = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: 'Instance URL (optional)',
      type: 'url',
      placeholder: 'https://api.bigcapital.com/api/',
      helpText:
        'Leave blank to use the Bigcapital cloud. For self-hosted instances, enter your API base URL (e.g. https://bigcapital.yourcompany.com/api/).',
      required: false,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'bc_xxxxxxxxx',
      helpText:
        'Find or generate your API key in Bigcapital under Settings → API Keys.',
      required: true,
    },
  ],
  async exchange(fields) {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const rawUrl = (fields['baseUrl'] ?? '').trim().replace(/\/+$/, '')
    const baseUrl = rawUrl ? `${rawUrl}/` : undefined
    return {
      accessToken: apiKey,
      extra: baseUrl ? { baseUrl } : {},
    }
  },
})
