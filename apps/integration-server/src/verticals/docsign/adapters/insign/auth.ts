/**
 * inSign auth helpers.
 *
 * inSign authenticates REST calls with HTTP Basic credentials issued per
 * instance. The shared sandbox uses fixed credentials (`controller` /
 * `pwd.insign.sandbox.4561`); a production instance ships its own username,
 * password, and base URL after a successful sandbox test. There is no
 * interactive OAuth flow, so `getAuthUrl()` throws and credentials are
 * collected through the Connect Link `credentialFields()` form.
 *
 * The username:password pair is base64-encoded once at exchange time and
 * stored as `credentials.accessToken`; the client sends it verbatim as
 * `Authorization: Basic <token>`. The per-instance base URL is stashed on
 * `credentials.extra.baseUrl` so the client can target sandbox or production.
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SANDBOX_BASE_URL } from './constants'

const FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      placeholder: 'controller',
      helpText:
        'Issued with your inSign instance. The shared sandbox uses "controller".',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key / password',
      type: 'password',
      helpText:
        'The Basic-auth secret for your inSign instance. Treat as a long-lived secret.',
      required: true,
    },
    {
      name: 'baseUrl',
      label: 'Instance base URL',
      type: 'text',
      placeholder: SANDBOX_BASE_URL,
      helpText:
        'Your production inSign host. Leave blank to target the public sandbox.',
      required: false,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const username = (fields.username ?? '').trim()
    const apiKey = (fields.apiKey ?? '').trim()
    if (!username || !apiKey) {
      throw new Error('inSign API username and key are required.')
    }
    const baseUrl = (fields.baseUrl ?? '').trim() || SANDBOX_BASE_URL
    const token = Buffer.from(`${username}:${apiKey}`).toString('base64')
    return {
      accessToken: token,
      extra: { baseUrl },
    }
  },
})

export const INSIGN_CREDENTIAL_FIELDS = FORM.credentialFields()

export const exchangeInsignCredentials = FORM.exchangeCredentials

export async function refreshInsignCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}
