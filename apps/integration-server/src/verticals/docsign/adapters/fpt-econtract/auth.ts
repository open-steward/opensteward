/**
 * FPT.eContract auth helpers — API key only.
 *
 * FPT.eContract authenticates partner/server requests with a static API key
 * sent in the `api-key` request header. There is no OAuth Authorization-Code
 * flow for server-to-server use, so `getAuthUrl`/`exchangeCode` are
 * unsupported and the Connect Link form collects the key (plus the
 * environment, which selects the API host).
 *
 * We use the shared `customForm` template rather than `simpleApiKey` so the
 * form can also capture the environment; the chosen base URL is stored on
 * `credentials.extra.baseUrl` for the client to read.
 *
 * Product: https://econtract.fpt.com.vn/
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { ENVIRONMENT_BASE_URLS, PROD_BASE_URL } from './constants'

export const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'FPT.eContract API key',
      type: 'password',
      placeholder: 'Your FPT.eContract partner API key',
      helpText:
        'In FPT.eContract, open the partner / API-integration settings to issue a key. The adapter sends it as the api-key request header.',
      required: true,
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      helpText: 'Match the environment your FPT.eContract tenant is provisioned in.',
      required: true,
      options: [
        { value: 'production', label: 'Production (api-econtract.fpt.com.vn)' },
        { value: 'sandbox', label: 'Sandbox / UAT (api-econtract-uat.fpt.com.vn)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields.apiKey ?? '').trim()
    if (!apiKey) throw new Error('FPT.eContract API key is required.')
    const environment = (fields.environment ?? 'production').trim().toLowerCase()
    const baseUrl = ENVIRONMENT_BASE_URLS[environment] ?? PROD_BASE_URL
    return {
      accessToken: apiKey,
      extra: { environment, baseUrl },
    }
  },
})
