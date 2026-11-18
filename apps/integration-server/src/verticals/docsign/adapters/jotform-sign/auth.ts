/**
 * Jotform auth helpers — API key only.
 *
 * Jotform authenticates backend requests with a static API key. There is no
 * OAuth Authorization-Code flow for server-to-server use, so `getAuthUrl` /
 * `exchangeCode` are unsupported and the Connect Link form collects the key
 * (plus the data region).
 *
 * We use the shared `customForm` template rather than `simpleApiKey` so the
 * form can also capture the region, which selects the API host and is stored
 * on `credentials.extra.baseUrl` for the client to read.
 *
 * Docs: https://api.jotform.com/docs/#authentication
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { REGION_BASE_URLS } from './constants'

export const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Jotform API key',
      type: 'password',
      placeholder: 'Your Jotform API key',
      helpText:
        'In Jotform, open Account → API and create a key (read access is sufficient). The adapter sends it as the APIKEY request header.',
      required: true,
    },
    {
      name: 'region',
      label: 'Data region',
      type: 'select',
      helpText: 'Match the region your Jotform account is hosted in.',
      required: true,
      options: [
        { value: 'us', label: 'United States (api.jotform.com)' },
        { value: 'eu', label: 'Europe (eu-api.jotform.com)' },
        { value: 'hipaa', label: 'HIPAA (hipaa-api.jotform.com)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields.apiKey ?? '').trim()
    if (!apiKey) throw new Error('Jotform API key is required.')
    const region = (fields.region ?? 'us').trim().toLowerCase()
    const baseUrl = REGION_BASE_URLS[region] ?? REGION_BASE_URLS.us
    return {
      accessToken: apiKey,
      extra: { region, baseUrl },
    }
  },
})
