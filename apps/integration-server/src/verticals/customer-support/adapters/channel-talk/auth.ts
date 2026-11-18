/**
 * Channel Talk authentication.
 *
 * Channel Talk (channel.io) uses a dual API-key scheme: every request must
 * carry both an Access Key and an Access Secret as custom HTTP headers:
 *   x-access-key:    <accessKey>
 *   x-access-secret: <accessSecret>
 *
 * Credentials are generated in Channel Desk under Settings → API Key
 * management.  There is no OAuth flow.
 *
 * Docs: https://developers.channel.io/docs/authentication-2
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('channel-talk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'accessKey',
      label: 'Access Key',
      type: 'text',
      required: true,
      helpText: 'Your Channel Talk Access Key from Settings → API Key management.',
    },
    {
      name: 'accessSecret',
      label: 'Access Secret',
      type: 'password',
      required: true,
      helpText: 'Your Channel Talk Access Secret from Settings → API Key management.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accessKey = fields['accessKey']
  const accessSecret = fields['accessSecret']
  if (!accessKey) throw new Error('channel-talk credentialFields require accessKey')
  if (!accessSecret) throw new Error('channel-talk credentialFields require accessSecret')
  return {
    // Store accessKey as accessToken for uniformity; accessSecret goes in extra
    accessToken: accessKey,
    extra: { accessSecret },
  }
}
