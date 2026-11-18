/**
 * Cognigy Live Agent authentication.
 *
 * Uses a static API key (user access token obtained from Live Agent
 * Profile Settings). Passed via the `api_access_token` header on each
 * request. No OAuth flow.
 *
 * Credentials also store `accountId` and `baseUrl` via `extra`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Cognigy Live Agent uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Live Agent base URL',
      type: 'text',
      required: true,
      helpText:
        'The base URL for your Cognigy Live Agent instance (e.g. https://liveagent-trial.cognigy.ai or https://liveagent-app.cognigy.ai).',
    },
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      required: true,
      helpText:
        'The numeric account ID visible in the Live Agent URL path, e.g. /accounts/12345/conversations.',
    },
    {
      name: 'apiAccessToken',
      label: 'API Access Token',
      type: 'password',
      required: true,
      helpText:
        'Your personal access token from Live Agent Profile Settings.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiAccessToken = fields['apiAccessToken']
  const accountId = fields['accountId']
  const baseUrl = (fields['baseUrl'] ?? '').replace(/\/$/, '')
  if (!apiAccessToken) throw new Error('Cognigy credentialFields require apiAccessToken')
  if (!accountId) throw new Error('Cognigy credentialFields require accountId')
  if (!baseUrl) throw new Error('Cognigy credentialFields require baseUrl')
  return {
    accessToken: apiAccessToken,
    extra: { accountId, baseUrl },
  }
}
