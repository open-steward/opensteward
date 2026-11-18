/**
 * PayTabs authentication — `api_key` model (no OAuth).
 *
 * Every PT2 API request authenticates with the merchant's **Server Key**, sent
 * verbatim as the value of the `authorization` header (there is no `Bearer`
 * prefix). Each request body also carries the merchant's **Profile ID** — a
 * non-secret identifier that scopes the call to a profile. Both values come
 * from the PayTabs dashboard → Developers → Key management. Test and live
 * profiles each issue their own Server Key, so the credentials themselves
 * select the environment; the only extra knob is the regional API host.
 *
 * The merchant supplies three static values through the Connect Link form:
 *   - serverKey → stored on `credentials.accessToken` (secret; the auth header)
 *   - profileId → stored on `credentials.extra.profileId` (sent in every body)
 *   - region    → stored on `credentials.extra.region` (selects the API host)
 *
 * Docs: https://support.paytabs.com/en/support/solutions/articles/60000709801
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { REGION_BASE_URLS } from './constants'

/** The Server Key for a stored connection — the `authorization` header value. */
export function serverKey(credentials: Credentials): string {
  return credentials.accessToken ?? ''
}

/** The Profile ID for a stored connection — sent in every request body. */
export function profileId(credentials: Credentials): string {
  const value = credentials.extra?.['profileId']
  return typeof value === 'string' ? value : ''
}

/** The region code for a stored connection — selects the regional API host. */
export function region(credentials: Credentials): string | undefined {
  const value = credentials.extra?.['region']
  return typeof value === 'string' ? value : undefined
}

const REGION_OPTIONS = Object.keys(REGION_BASE_URLS).map((value) => ({ value, label: value }))

/**
 * Connect-form descriptor + exchange. A bespoke (vs. `simpleApiKey`) form
 * because PayTabs needs the secret Server Key, the non-secret Profile ID, and
 * the merchant's region to pick the right API host.
 */
export const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'serverKey',
      label: 'Server key',
      type: 'password',
      required: true,
      helpText:
        'Your PayTabs profile Server Key, from the PayTabs dashboard → Developers → Key management. Sent as the authorization header on every request.',
    },
    {
      name: 'profileId',
      label: 'Profile ID',
      type: 'text',
      required: true,
      helpText: 'Your PayTabs Profile ID (the numeric profile identifier shown beside the Server Key).',
    },
    {
      name: 'region',
      label: 'Region',
      type: 'select',
      required: true,
      options: REGION_OPTIONS,
      helpText:
        'The PayTabs region that issued your profile. Determines the API host (e.g. ARE → secure.paytabs.com, SAU → secure.paytabs.sa).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const key = (fields['serverKey'] ?? '').trim()
    const profile = (fields['profileId'] ?? '').trim()
    const reg = (fields['region'] ?? '').trim().toUpperCase()
    if (!key) throw new Error('Server key is required.')
    if (!profile) throw new Error('Profile ID is required.')
    if (!REGION_BASE_URLS[reg]) throw new Error(`Unknown PayTabs region: ${reg || '(empty)'}.`)
    return { accessToken: key, extra: { profileId: profile, region: reg } }
  },
})
