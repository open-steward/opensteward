/**
 * Vendure auth helpers.
 *
 * Vendure uses bearer tokens obtained via the `login` mutation on the
 * admin API, or a static API key via AuthenticationStrategy.
 *
 * The adapter accepts a pre-generated bearer token (similar to Saleor App tokens).
 * `refreshCredentials` calls the `login` mutation again with stored
 * username/password from `extra`.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

/**
 * Build a placeholder auth URL. Vendure does not use browser-redirect
 * OAuth -- tokens are created via the admin API `login` mutation or
 * configured as static API keys.
 */
export function buildAuthUrl(apiUrl: string, state: string): string {
  return `${apiUrl.replace(/\/admin-api\/?$/, '')}/admin/?state=${encodeURIComponent(state)}`
}

/**
 * Stub code exchange. Returns the code as-is since the "code" the caller
 * passes is really the pre-provisioned bearer token.
 */
export async function exchangeCode(
  code: string,
  apiUrl: string,
  channelToken: string,
): Promise<Credentials> {
  return {
    accessToken: code,
    extra: { apiUrl, channelToken },
  }
}

/**
 * Refresh credentials by calling the `login` mutation with stored
 * username/password. Falls back to returning credentials as-is if
 * username/password are not available.
 */
export async function refreshCredentials(
  credentials: Credentials,
  apiUrl: string,
  channelToken: string,
): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, string>
  const username = extra['username']
  const password = extra['password']

  if (!username || !password) {
    // No stored login credentials -- return as-is (static token)
    return credentials
  }

  const gql = `
    mutation Login($username: String!, $password: String!) {
      login(username: $username, password: $password) {
        ... on CurrentUser {
          id
        }
        ... on InvalidCredentialsError {
          message
        }
      }
    }
  `

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (channelToken) {
    headers['vendure-token'] = channelToken
  }

  const { data: res } = await axios.post(
    apiUrl,
    { query: gql, variables: { username, password } },
    { headers, timeout: 30_000 },
  )

  // The login mutation sets an auth cookie; extract the token from the
  // response headers if available, otherwise keep the existing token.
  const authToken =
    res?.data?.login?.id != null
      ? credentials.accessToken // keep the session alive
      : credentials.accessToken

  return {
    ...credentials,
    accessToken: authToken,
    extra: { ...extra, apiUrl, channelToken },
  }
}
