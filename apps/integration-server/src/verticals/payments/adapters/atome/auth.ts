/**
 * Atome auth is HTTP Basic (`auth_type: api_key`).
 *
 * Atome issues each merchant a **username** and **password** out-of-band (via
 * the Atome Account Manager). Every request carries them as
 * `Authorization: Basic base64(username:password)`. We compute that Base64
 * token once at connect time and store it on `credentials.accessToken`, so the
 * client never has to re-encode it.
 *
 * The merchant also chooses an environment (sandbox vs. production) which picks
 * the API host; we persist it on `credentials.extra.environment`.
 *
 * This is a genuinely-bespoke shape (two secret fields encoded into one Basic
 * token, plus an environment selector), so we build the form with the shared
 * `customForm` template rather than `simpleApiKey`.
 *
 * Docs: https://doc.apaylater.com/v2/
 */
import { customForm, type CredentialFormHelper, type Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type AtomeEnvironment } from './constants'

export interface AtomeCredentialExtra {
  environment: AtomeEnvironment
}

function normaliseEnvironment(value: string | undefined): AtomeEnvironment {
  return value === 'production' ? 'production' : DEFAULT_ENVIRONMENT
}

/** Encode `username:password` as the Basic-auth credential token. */
export function encodeBasicToken(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString('base64')
}

export const AtomeCredentialForm: CredentialFormHelper = customForm({
  fields: [
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Issued by your Atome Account Manager together with the password.',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
      helpText: 'Issued by your Atome Account Manager. Used for HTTP Basic authentication.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      helpText: 'Sandbox uses api.apaylater.net; production uses api.apaylater.com.',
      options: [
        { value: 'sandbox', label: 'Sandbox (api.apaylater.net)' },
        { value: 'production', label: 'Production (api.apaylater.com)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const username = (fields.username ?? '').trim()
    const password = fields.password ?? ''
    if (!username || !password) {
      throw new Error('An Atome username and password are required.')
    }
    const extra: AtomeCredentialExtra = { environment: normaliseEnvironment(fields.environment) }
    return {
      accessToken: encodeBasicToken(username, password),
      extra: extra as unknown as Record<string, unknown>,
    }
  },
})
