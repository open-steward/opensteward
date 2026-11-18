/**
 * CoinPayments v2 credential model.
 *
 * CoinPayments authenticates every request with API-key request-signing rather
 * than OAuth or a single bearer token. Each integration created in the
 * CoinPayments dashboard issues a **client ID** (public identifier, sent in the
 * `X-CoinPayments-Client` header) and a **client secret** (the HMAC key used to
 * sign every request — see `./client.ts`). Both are required, so we collect
 * them through the Connect Link form via the shared `customForm` template and
 * map them onto `Credentials`:
 *
 *   - `accessToken`        → client ID     (the public identifier in the header)
 *   - `extra.clientSecret` → client secret (the HMAC signing key)
 *
 * The same client secret signs (and verifies) inbound webhooks — see
 * `./webhook.ts`.
 *
 * Docs: https://docs.coinpayments.net/api/auth/
 */
import { customForm, type CredentialField, type Credentials } from '@opensteward/shared'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText:
      'Create an API integration in the CoinPayments dashboard (Account → API Keys); the Client ID is shown there.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText:
      'Shown once when the integration is created. Used to sign every API request and to verify webhooks.',
  },
]

export const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields.clientId ?? '').trim()
    const clientSecret = (fields.clientSecret ?? '').trim()
    if (!clientId) throw new Error('Client ID is required.')
    if (!clientSecret) throw new Error('Client secret is required.')
    return {
      accessToken: clientId,
      extra: { clientSecret },
    }
  },
})
