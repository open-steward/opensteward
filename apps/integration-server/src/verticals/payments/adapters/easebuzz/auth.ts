/**
 * Easebuzz credential model.
 *
 * Easebuzz has no OAuth and no bearer token. Every server-to-server call
 * carries the merchant `key` in the request body alongside a per-request
 * SHA-512 `hash` computed from the request fields + the merchant `salt`
 * (see `client.ts`). The same `salt` verifies inbound webhook signatures.
 *
 * The merchant picks an environment (test / prod) when connecting; it selects
 * which Easebuzz host the client talks to (see `constants.ts`).
 *
 * Credentials shape:
 *   accessToken      → merchant key   (the public-ish identifier sent on the wire)
 *   extra.salt       → merchant salt  (the signing secret; never sent on the wire)
 *   extra.environment→ 'test' | 'prod'
 *
 * Collected via the Connect Link form using a `customForm` template.
 *
 * Docs: https://docs.easebuzz.in/docs/payment-gateway (Settings > API Keys)
 */
import type { Credentials } from '@opensteward/shared'
import { customForm, type CredentialFormHelper } from '@opensteward/shared'
import type { EasebuzzEnv } from './constants'

export const CREDENTIAL_FORM: CredentialFormHelper = customForm({
  fields: [
    {
      name: 'merchantKey',
      label: 'Merchant key',
      type: 'text',
      required: true,
      helpText: 'Dashboard → Settings → API Keys → Merchant Key.',
    },
    {
      name: 'salt',
      label: 'Salt (merchant key secret)',
      type: 'password',
      required: true,
      helpText: 'Dashboard → Settings → API Keys → Salt. Used to sign every request and verify webhooks.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'prod', label: 'Production' },
        { value: 'test', label: 'Test (sandbox)' },
      ],
      helpText: 'Test uses testpay/testdashboard.easebuzz.in; Production uses pay/dashboard.easebuzz.in.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const merchantKey = (fields.merchantKey ?? '').trim()
    const salt = (fields.salt ?? '').trim()
    if (!merchantKey) throw new Error('Merchant key is required.')
    if (!salt) throw new Error('Salt is required.')
    const environment: EasebuzzEnv = fields.environment === 'test' ? 'test' : 'prod'
    return {
      accessToken: merchantKey,
      extra: { salt, environment },
    }
  },
})

/** Merchant key — sent in every request body as `key`. */
export function merchantKey(credentials: Credentials): string {
  return credentials.accessToken
}

/** Signing salt — never sent on the wire; used to build the request hash + verify webhooks. */
export function merchantSalt(credentials: Credentials): string {
  return String(credentials.extra?.salt ?? '')
}

/** Selected environment, defaulting to production. */
export function environment(credentials: Credentials): EasebuzzEnv {
  return credentials.extra?.environment === 'test' ? 'test' : 'prod'
}
