/**
 * ZorroSign auth — API-key model.
 *
 * ZorroSign issues an account API key through its developer program; there
 * is no OAuth handshake. The customer supplies the key plus the environment
 * (production / sandbox) on the hosted Connect Link form. We resolve the
 * environment to a REST base URL and stash it on `credentials.extra.baseUrl`
 * so the client knows which host to hit.
 *
 * Built on the shared `customForm` template so the credential-field
 * descriptor + exchange function stay consistent with the rest of the repo.
 */

import { customForm, type CredentialFormHelper } from '@opensteward/shared'
import { PROD_BASE_URL, SANDBOX_BASE_URL } from './constants'

export const ENVIRONMENT_FIELD = 'environment'
export const API_KEY_FIELD = 'apiKey'

export function baseUrlForEnvironment(environment: string | undefined): string {
  return environment === 'sandbox' ? SANDBOX_BASE_URL : PROD_BASE_URL
}

/**
 * Connect Link form: an API key plus an environment selector. The chosen
 * REST base URL is persisted on `credentials.extra.baseUrl`.
 */
export const ZORROSIGN_CREDENTIAL_FORM: CredentialFormHelper = customForm({
  fields: [
    {
      name: API_KEY_FIELD,
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Found in your ZorroSign developer-program account settings.',
    },
    {
      name: ENVIRONMENT_FIELD,
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'production', label: 'Production' },
        { value: 'sandbox', label: 'Sandbox (staging)' },
      ],
    },
  ],
  async exchange(input) {
    const apiKey = (input?.[API_KEY_FIELD] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const environment = (input?.[ENVIRONMENT_FIELD] ?? 'production').trim()
    return {
      accessToken: apiKey,
      extra: {
        environment,
        baseUrl: baseUrlForEnvironment(environment),
      },
    }
  },
})
