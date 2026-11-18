/**
 * Chaskiq auth — OAuth2 Bearer token via Doorkeeper.
 *
 * Operators obtain a personal access token from their Chaskiq instance.
 * The token is stored as `accessToken`; the app key (found in Settings →
 * Account) is stored in `extra.appKey`. Self-hosted users also supply
 * `extra.instanceUrl`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('chaskiq uses static Bearer token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      helpText: 'OAuth2 Bearer token from your Chaskiq account settings.',
    },
    {
      name: 'appKey',
      label: 'App Key',
      type: 'text',
      required: true,
      helpText: 'Your Chaskiq app key (found in Settings → Account).',
    },
    {
      name: 'instanceUrl',
      label: 'Instance URL (optional)',
      type: 'text',
      required: false,
      helpText: 'For self-hosted instances. Leave blank for cloud (app.chaskiq.io).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accessToken = fields['accessToken']
  const appKey = fields['appKey']
  if (!accessToken) throw new Error('chaskiq credentialFields require accessToken')
  if (!appKey) throw new Error('chaskiq credentialFields require appKey')
  return {
    accessToken,
    extra: {
      appKey,
      ...(fields['instanceUrl'] ? { instanceUrl: fields['instanceUrl'] } : {}),
    },
  }
}
