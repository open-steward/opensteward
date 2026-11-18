/**
 * VosFactures authentication helpers.
 *
 * VosFactures uses a static API token (no OAuth).  The token is obtained from
 * the account's Settings → Integration → API Authorization Code page and is
 * passed as the `api_token` query-string parameter on every request.
 *
 * The user also supplies their account subdomain (e.g. "mycompany") which
 * determines the per-tenant base URL.
 *
 * We use the `customForm` credential template extended with an additional
 * `accountName` field so the adapter can build the correct base URL at
 * runtime.  The final `Credentials` object has:
 *   - `accessToken`: the api_token value
 *   - `extra.accountName`: the subdomain
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'

/** Landing page where users can find their API token. */
export const VOSFACTURES_SETTINGS_URL = 'https://vosfactures.fr/compte'

export const VOSFACTURES_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accountName',
      label: 'Account name (subdomain)',
      type: 'text',
      placeholder: 'mycompany',
      helpText:
        'Your VosFactures account subdomain, e.g. "mycompany" for mycompany.vosfactures.fr',
      required: true,
    },
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password',
      placeholder: 'qCedKxkTgQhGJpiI2SU',
      helpText:
        "Found in Paramètres → Paramètres du compte → Intégration → Code d'autorisation API",
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const accountName = (fields['accountName'] ?? '').trim()
    const apiToken = (fields['apiToken'] ?? '').trim()
    if (!accountName) throw new Error('Account name is required.')
    if (!apiToken) throw new Error('API token is required.')
    return {
      accessToken: apiToken,
      extra: { accountName },
    }
  },
})

/**
 * buildAuthUrl — directs users to the VosFactures account settings page
 * where they can retrieve their API token.
 */
export function buildAuthUrl(_state: string): string {
  return VOSFACTURES_SETTINGS_URL
}

/**
 * exchangeCode — not used for api_key flow; kept for interface compatibility.
 * The `code` param here is expected to be "accountName:apiToken".
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  const idx = code.indexOf(':')
  const accountName = idx !== -1 ? code.slice(0, idx).trim() : code.trim()
  const apiToken = idx !== -1 ? code.slice(idx + 1).trim() : ''
  return { accessToken: apiToken, extra: { accountName } }
}

/**
 * refreshCredentials — VosFactures API tokens do not expire; return unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
