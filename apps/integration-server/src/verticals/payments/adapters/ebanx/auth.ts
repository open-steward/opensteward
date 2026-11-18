/**
 * EBANX authenticates every Direct API call with a single secret
 * `integration_key`, sent as a body field on each POST — there is no OAuth
 * flow and no Authorization header. Test keys are issued at signup; live
 * keys after onboarding.
 *
 * Because sandbox and production live on different hosts, the Connect form
 * also collects the environment so one connection knows which host to call.
 * Both values ride on the canonical `Credentials`:
 *   - integration_key → `accessToken`
 *   - environment     → `extra.environment` ('sandbox' | 'production')
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export type EbanxEnvironment = 'sandbox' | 'production'

/** Resolve the API host for a stored connection (defaults to sandbox). */
export function baseUrlFor(credentials: Credentials): string {
  const env = credentials.extra?.['environment']
  return env === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

/** The merchant secret integration key for a stored connection. */
export function integrationKey(credentials: Credentials): string {
  return credentials.accessToken
}

/**
 * Connect-form descriptor + exchange. A bespoke (vs. `simpleApiKey`) form
 * because EBANX needs the environment alongside the key.
 */
export const FORM = customForm({
  fields: [
    {
      name: 'integrationKey',
      label: 'Integration key',
      type: 'password',
      required: true,
      helpText: 'Your EBANX integration key (unique + secret). Found in the EBANX Dashboard.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'sandbox', label: 'Sandbox (test)' },
        { value: 'production', label: 'Production (live)' },
      ],
      helpText: 'Sandbox uses test keys; Production requires onboarded live keys.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const key = (fields['integrationKey'] ?? '').trim()
    if (!key) throw new Error('Integration key is required.')
    const environment: EbanxEnvironment =
      fields['environment'] === 'production' ? 'production' : 'sandbox'
    return { accessToken: key, extra: { environment } }
  },
})
