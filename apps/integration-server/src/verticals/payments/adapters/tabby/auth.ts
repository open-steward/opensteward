/**
 * Tabby auth is a static secret-key bearer token (`auth_type: api_key`).
 *
 * The merchant pastes their **secret key** (`sk_test_…` / `sk_live_…`) from the
 * Tabby merchant dashboard; every API call carries it as
 * `Authorization: Bearer <secret_key>`. Tabby derives test-vs-live from the key
 * itself, so there is no separate sandbox host — only a region choice (AE/KW
 * `.ai` vs. KSA `.sa`) that picks the production host. We persist that region
 * on `credentials.extra.region` so the client can resolve the base URL.
 *
 * This is genuinely-bespoke (an api_key plus a region selector), so we build
 * the form with the shared `customForm` template rather than `simpleApiKey`.
 *
 * Docs: https://docs.tabby.ai/api-reference/overview
 */
import { customForm, type CredentialFormHelper, type Credentials } from '@opensteward/shared'
import type { TabbyRegion } from './constants'

export interface TabbyCredentialExtra {
  region: TabbyRegion
}

function normaliseRegion(value: string | undefined): TabbyRegion {
  return value === 'sa' ? 'sa' : 'ae'
}

export const TabbyCredentialForm: CredentialFormHelper = customForm({
  fields: [
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      placeholder: 'sk_live_… or sk_test_…',
      helpText:
        'From your Tabby merchant dashboard → Settings → API keys. Test keys keep the connection in test mode automatically.',
    },
    {
      name: 'region',
      label: 'Region',
      type: 'select',
      required: true,
      helpText: 'The market your Tabby account is onboarded in — it selects the API host.',
      options: [
        { value: 'ae', label: 'UAE / Kuwait (api.tabby.ai)' },
        { value: 'sa', label: 'Saudi Arabia (api.tabby.sa)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const secretKey = (fields.secretKey ?? '').trim()
    if (!secretKey) throw new Error('A Tabby secret key is required.')
    const extra: TabbyCredentialExtra = { region: normaliseRegion(fields.region) }
    return {
      accessToken: secretKey,
      extra: extra as unknown as Record<string, unknown>,
    }
  },
})
