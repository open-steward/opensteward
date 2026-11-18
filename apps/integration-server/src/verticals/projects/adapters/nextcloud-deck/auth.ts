/**
 * Nextcloud Deck auth — api_key model.
 *
 * Nextcloud uses HTTP Basic Auth. The "API key" here is a Nextcloud App Password
 * (Settings > Security > Devices & sessions > Create new app password). The
 * username is the Nextcloud account login. We store both in credentialFields and
 * encode them as Base64 for the Authorization header in the client.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('nextcloud-deck uses Basic Auth with app passwords; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'serverUrl',
      label: 'Nextcloud Server URL',
      type: 'text',
      required: true,
      helpText: 'Base URL of your Nextcloud instance, e.g. https://cloud.example.com',
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Your Nextcloud account username.',
    },
    {
      name: 'appPassword',
      label: 'App Password',
      type: 'password',
      required: true,
      helpText:
        'Generate under Settings > Security > Devices & sessions > Create new app password.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const serverUrl = fields['serverUrl']?.replace(/\/$/, '')
  const username = fields['username']
  const appPassword = fields['appPassword']
  if (!serverUrl || !username || !appPassword) {
    throw new Error('nextcloud-deck requires serverUrl, username, and appPassword')
  }
  const token = Buffer.from(`${username}:${appPassword}`).toString('base64')
  return {
    accessToken: token,
    extra: { serverUrl, username },
  }
}
