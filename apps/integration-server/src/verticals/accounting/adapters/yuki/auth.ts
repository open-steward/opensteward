/**
 * Yuki authentication — SOAP-based API key (no OAuth2 redirect flow).
 *
 * Credentials model:
 *   accessToken             = WebserviceAccessKey  (entered once by the user)
 *   extra.administrationId  = AdministrationID     (entered once by the user)
 *
 * The administration ID is kept out of `tenantId` on purpose: the control
 * plane reads `credentials.tenantId` as the OpenSteward tenant of the
 * connection. The legacy `exchangeCode("key:administrationId")` below still
 * writes `tenantId`, and the client still reads it as a fallback.
 *
 * There is no token refresh — the access key does not expire.
 * Session IDs are obtained per-request inside YukiSoapClient by calling
 * the Authenticate SOAP method; they are short-lived and not persisted.
 */

import { customForm, type CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'

/** No browser redirect flow for Yuki — return a sentinel URL */
export function getAuthUrl(_state: string): string {
  return 'https://support.yuki.nl/en/support/solutions/articles/80000786451'
}

/**
 * Legacy manual credential entry.
 * `code` format: "<accessKey>:<administrationId>"
 * If no colon, treat entire string as the access key (administrationId unknown).
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  const colonIdx = code.indexOf(':')
  if (colonIdx === -1) {
    return { accessToken: code }
  }
  const accessKey = code.slice(0, colonIdx)
  const administrationId = code.slice(colonIdx + 1)
  return {
    accessToken: accessKey,
    tenantId: administrationId,
  }
}

/**
 * API keys in Yuki do not expire — return credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

// ── Connect Link form ────────────────────────────────────────────────────────

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'Web service access key',
    type: 'password',
    required: true,
    helpText:
      'In Yuki: click the switch-domain icon above the navigation bar → My domain → web service access keys. Requires the Back office or Management role.',
  },
  {
    name: 'administrationId',
    label: 'Administration ID',
    type: 'text',
    required: true,
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    helpText:
      'The GUID of the administration to connect, shown on the same My domain screen (Yuki support: "Where can I find the API key and Administration ID in Yuki?").',
  },
]

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Web service access key is required.')
    const administrationId = (input['administrationId'] ?? '')
      .trim()
      .replace(/^\{\s*(.*?)\s*\}$/, '$1')
    if (!administrationId) throw new Error('Administration ID is required.')
    if (!GUID_PATTERN.test(administrationId)) {
      throw new Error(
        'Administration ID must be a GUID such as 0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d.',
      )
    }
    return { accessToken: apiKey, extra: { administrationId } }
  },
})
