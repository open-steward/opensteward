/**
 * Comm100 API-key authentication.
 *
 * https://developer.comm100.com/docs/server-api-authentication:
 *   "To authenticate API requests, you must include your email and API key.
 *   Authentication is done via HTTP Basic Auth, where your email is the
 *   username, and the API key is the password."
 *   "Important: When using the API key for authentication, ensure that you
 *   include the siteId parameter."
 *
 * The password grant this adapter used before is documented as "Not
 * Recommended, Deprecated", needs a client_id it never sent, and issues
 * tokens with "expires_in": 43200 that it never refreshed. The API key does
 * not expire, so the connection needs no refresh.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { PLATFORM_NUMBERS } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'email',
      label: 'Agent Email',
      type: 'text',
      required: true,
      helpText: 'The login email of the Comm100 agent whose API key you use.',
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Control Panel → your avatar → agent name → My Profile → More Information → Your API Key.',
    },
    {
      name: 'siteId',
      label: 'Site ID',
      type: 'text',
      required: true,
      helpText: 'Your Comm100 site id. API-key requests must carry it.',
    },
    {
      name: 'portalNumber',
      label: 'Control Panel Domain Number',
      type: 'text',
      required: true,
      helpText: `The number in your Control Panel domain, e.g. "11" for dash11.comm100.io. One of ${PLATFORM_NUMBERS.join(', ')}.`,
    },
  ]
}

export function isPlatformNumber(n: string): n is (typeof PLATFORM_NUMBERS)[number] {
  return (PLATFORM_NUMBERS as readonly string[]).includes(n)
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const email = fields['email']?.trim()
  const apiKey = fields['apiKey']?.trim()
  const siteId = fields['siteId']?.trim()
  const portalNumber = fields['portalNumber']?.trim()
  if (!email || !apiKey || !siteId || !portalNumber)
    throw new Error('comm100 requires email, apiKey, siteId and portalNumber')
  if (!isPlatformNumber(portalNumber))
    throw new Error(
      `comm100 portalNumber must be one of ${PLATFORM_NUMBERS.join(', ')} (the n in dash{n}.comm100.io)`,
    )
  return {
    accessToken: apiKey,
    extra: { email, siteId, portalNumber },
  }
}

export function getAuthUrlUnsupported(): never {
  throw new Error('comm100 uses API-key authentication; use credentialFields() instead')
}
