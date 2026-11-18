/**
 * SeaTable auth — static tokens, no OAuth2 flow.
 *
 * https://api.seatable.com/reference/authentication:
 *   "Every account operation (user, team admin or system admin) requires an
 *    Account-Token."
 *   "Every base operation requires a Base-Token."
 *   API-Token: "An API-Token is like a password to use the API requests of a
 *    single base. The main purpose of an API-Token is to generate a
 *    Base-Token or to grant access to the files of a base."
 *   Account-Token: "The Account-Token can be generated with the
 *    account-credentials." (POST /api2/auth-token/ with username + password,
 *    https://api.seatable.com/llms-full.txt "Get Account-Token with Username
 *    and Password")
 *
 * `apiToken` (required) is the base API-Token (Base → Advanced → API Token),
 * exchanged for a Base-Token for rows, comments and collaborators.
 * `accountToken` (optional) is what the account operations — list workspaces,
 * list bases — authenticate with; without it those methods refuse with 501.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('seatable uses static API Token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
    },
    {
      name: 'accountToken',
      label:
        'Account-Token (optional; needed to list workspaces and bases — generated with POST /api2/auth-token/)',
      type: 'password',
      required: false,
    },
    {
      name: 'serverUrl',
      label: 'Server URL (leave blank for cloud.seatable.io)',
      type: 'text',
      required: false,
    },
  ]
}

/** The Account-Token a connection was given, if any. */
export function accountTokenOf(credentials: Credentials): string | undefined {
  const token = credentials.extra?.['accountToken']
  return typeof token === 'string' && token.trim() ? token.trim() : undefined
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  if (!apiToken) throw new Error('seatable credentialFields require apiToken')
  const accountToken = fields['accountToken']?.trim()
  return {
    accessToken: apiToken,
    extra: {
      serverUrl: fields['serverUrl'] ?? '',
      ...(accountToken ? { accountToken } : {}),
    },
  }
}
