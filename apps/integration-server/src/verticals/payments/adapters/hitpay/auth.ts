/**
 * HitPay authenticates every API call with a single business API key sent in
 * the `X-BUSINESS-API-KEY` header — there is no OAuth flow. The customer also
 * supplies an `environment` (live / sandbox) so we hit the right host, and the
 * webhook `salt` value used to verify inbound event signatures.
 *
 * The salt is stored on `credentials.extra` so `verifyWebhook` can reach it,
 * and `environment` likewise so the client picks the correct base URL.
 *
 * Docs: https://docs.hitpayapp.com/apis/guide/online-payments
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export type HitpayEnvironment = 'live' | 'sandbox'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Dashboard → Settings → API Keys. This is your business API key.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: false,
      helpText: 'Use sandbox for test business keys, live for production.',
      options: [
        { value: 'live', label: 'Live (api.hit-pay.com)' },
        { value: 'sandbox', label: 'Sandbox (api.sandbox.hit-pay.com)' },
      ],
    },
    {
      name: 'salt',
      label: 'Webhook salt',
      type: 'password',
      required: false,
      helpText: 'Dashboard → Settings → API Keys → Salt. Used to verify webhook signatures.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('HitPay API key is required.')
  const environment: HitpayEnvironment = fields.environment === 'sandbox' ? 'sandbox' : 'live'
  const extra: Record<string, unknown> = { environment }
  const salt = (fields.salt ?? '').trim()
  if (salt) extra.salt = salt
  return { accessToken: apiKey, extra }
}

export function resolveEnvironment(credentials: Credentials): HitpayEnvironment {
  return credentials.extra?.['environment'] === 'sandbox' ? 'sandbox' : 'live'
}
