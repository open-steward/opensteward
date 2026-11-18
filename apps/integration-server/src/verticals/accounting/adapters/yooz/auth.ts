/**
 * Yooz Rising auth helpers.
 *
 * Yooz uses an API-key model: each integration is registered in the Yooz
 * Rising portal which issues a stable Bearer access token and an applicationId
 * (UUID). Both are entered once by the user in the Connect form and stored in
 * credentials without expiry / refresh.
 *
 * There is no OAuth redirect flow and no token refresh.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error(
    'Yooz uses API key authentication; use credentialFields() / exchangeCredentials() instead of OAuth.',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'Bearer token issued by Yooz Rising. Find it in your Yooz Rising portal under Settings → API.',
    },
    {
      name: 'applicationId',
      label: 'Application ID',
      type: 'text',
      required: true,
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText:
        'UUID of your registered application in the Yooz Rising portal (Settings → API → Applications).',
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields['apiKey'] ?? '').trim()
  const applicationId = (fields['applicationId'] ?? '').trim()
  if (!apiKey) throw new Error('Yooz API Token is required.')
  if (!applicationId) throw new Error('Yooz Application ID is required.')
  return {
    accessToken: apiKey,
    extra: { applicationId },
  }
}
