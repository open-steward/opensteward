/**
 * BitPay `pos`-facade API-token auth.
 *
 * BitPay's `pos` facade authenticates with a single API token minted in the
 * merchant dashboard (My Account → API Tokens, with the "Token requires
 * authentication" option DISABLED so requests need no ECDSA signing). The
 * token is the only secret: it is sent verbatim in the request body (POST) or
 * as the `token` query param (GET) — there is no OAuth flow and no refresh.
 *
 * A token is minted per environment, so the customer also selects which host
 * the token belongs to (production `bitpay.com` vs test `test.bitpay.com`).
 * We stash the token on `accessToken` and the environment on `extra` so the
 * client can pick the right base URL.
 *
 * The same token also keys webhook (IPN) HMAC verification — see webhook.ts.
 *
 * Docs: https://developer.bitpay.com/reference/getting-access
 *       https://developer.bitpay.com/reference/concepts
 */
import { customForm, type Credentials } from '@opensteward/shared'

export const BITPAY_AUTH = customForm({
  fields: [
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password',
      required: true,
      placeholder: 'BitPay POS-facade token',
      helpText:
        'Mint a token under My Account → API Tokens with “Token requires authentication” disabled (POS facade).',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      helpText: 'A token is minted per environment — pick the one it belongs to.',
      options: [
        { value: 'production', label: 'Production (bitpay.com)' },
        { value: 'test', label: 'Test / sandbox (test.bitpay.com)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const token = (fields.apiToken ?? '').trim()
    if (!token) throw new Error('A BitPay API token is required.')
    const environment = fields.environment === 'production' ? 'production' : 'test'
    return { accessToken: token, extra: { environment } }
  },
})

/** Read the environment slug stored on the credentials' `extra` bag. */
export function environmentOf(credentials: Credentials): string | undefined {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return typeof env === 'string' ? env : undefined
}
