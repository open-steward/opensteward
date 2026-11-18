/**
 * Toggl Plan API key authentication.
 *
 * Toggl Plan uses OAuth 2.0 Bearer tokens. For the api_key auth model
 * the user supplies a long-lived access token (obtained via their OAuth
 * app or the password-credentials grant) which is stored directly as
 * credentials.accessToken and sent as a Bearer header.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('toggl-plan uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Your Toggl Plan OAuth access token. Find it in your Toggl Plan account settings.',
    },
    {
      name: 'workspaceId',
      label: 'Workspace ID',
      type: 'text',
      required: true,
      helpText: 'The numeric ID of your Toggl Plan workspace (visible in the URL when logged in).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = (fields['apiToken'] ?? '').trim()
  const workspaceId = (fields['workspaceId'] ?? '').trim()
  if (!apiToken) throw new Error('API Token is required.')
  if (!workspaceId) throw new Error('Workspace ID is required.')
  return {
    accessToken: apiToken,
    extra: { workspaceId },
  }
}
