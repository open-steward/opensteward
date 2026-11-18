/**
 * BoldSign auth helpers — API key only.
 *
 * BoldSign authenticates backend requests with a static API key sent in the
 * `X-API-KEY` header. There is no OAuth Authorization-Code flow for
 * server-to-server use, so `getAuthUrl`/`exchangeCode` are unsupported and
 * the Connect Link form collects the key (plus the data region).
 *
 * We use the shared `customForm` template rather than `simpleApiKey` so the
 * form can also capture the region, which selects the API host and is stored
 * on `credentials.extra.baseUrl` for the client to read.
 *
 * Docs: https://developers.boldsign.com/authentication/api-key/
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { REGION_BASE_URLS } from './constants'

export const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'BoldSign API key',
      type: 'password',
      placeholder: 'Your BoldSign API key',
      helpText:
        'In BoldSign, open Settings → API and generate a key. The adapter sends it as the X-API-KEY request header.',
      required: true,
    },
    {
      name: 'region',
      label: 'Data region',
      type: 'select',
      helpText: 'Match the region your BoldSign account is hosted in.',
      required: true,
      options: [
        { value: 'us', label: 'United States (api.boldsign.com)' },
        { value: 'eu', label: 'Europe (api-eu.boldsign.com)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields.apiKey ?? '').trim()
    if (!apiKey) throw new Error('BoldSign API key is required.')
    const region = (fields.region ?? 'us').trim().toLowerCase()
    const baseUrl = REGION_BASE_URLS[region] ?? REGION_BASE_URLS.us
    return {
      accessToken: apiKey,
      extra: { region, baseUrl },
    }
  },
})
