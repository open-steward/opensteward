/**
 * Privy (PrivyID) auth helpers — merchant key only.
 *
 * The Privy merchant API authenticates server-to-server requests with a
 * static merchant key sent in the `Merchant-Key` request header. There is
 * no OAuth Authorization-Code flow for the merchant API, so
 * `getAuthUrl`/`exchangeCode` are unsupported and the Connect Link form
 * collects the key (plus the environment, which selects the API host).
 *
 * We use the shared `customForm` template rather than `simpleApiKey` so the
 * form can also capture the environment; the chosen base URL is stored on
 * `credentials.extra.baseUrl` for the client to read, and the raw merchant
 * key on `credentials.accessToken`.
 *
 * Product: https://privy.id/
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { ENVIRONMENT_BASE_URLS, PROD_BASE_URL } from './constants'

export const FORM = customForm({
  fields: [
    {
      name: 'merchantKey',
      label: 'Privy merchant key',
      type: 'password',
      placeholder: 'Your Privy enterprise merchant key',
      helpText:
        'In the Privy Developer Console (console.privy.id), open your enterprise integration settings to issue a merchant key. The adapter sends it as the Merchant-Key request header.',
      required: true,
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      helpText: 'Match the environment your Privy merchant account is provisioned in.',
      required: true,
      options: [
        { value: 'production', label: 'Production (core.privy.id)' },
        { value: 'sandbox', label: 'Sandbox (api-sandbox.privy.id)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const merchantKey = (fields.merchantKey ?? '').trim()
    if (!merchantKey) throw new Error('Privy merchant key is required.')
    const environment = (fields.environment ?? 'production').trim().toLowerCase()
    const baseUrl = ENVIRONMENT_BASE_URLS[environment] ?? PROD_BASE_URL
    return {
      accessToken: merchantKey,
      extra: { environment, baseUrl },
    }
  },
})
