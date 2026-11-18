/**
 * Modusign auth helpers.
 *
 * This adapter authenticates with an API key. Modusign's API-key scheme is
 * HTTP Basic with the account email as the user id and the key as the
 * password (https://developers.modusign.co.kr/docs/api-key로-요청하기.md:
 * "ID는 사용자의 이메일을, 패스워드에 해당하는 부분은 발급 받은 API KEY로
 * 사용합니다"). The hosted Connect form collects both: the key is persisted to
 * `credentials.accessToken`, the email to `credentials.extra.email`.
 * `getAuthUrl` is unsupported.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  throw new Error(
    'Modusign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Modusign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const email = fields['email']
  if (!apiKey) throw new Error('Modusign exchangeCredentials requires field "apiKey"')
  if (!email) throw new Error('Modusign exchangeCredentials requires field "email"')
  return {
    accessToken: apiKey,
    extra: { email },
  }
}

/**
 * The `Authorization` header value: `Basic base64(<email>:<apiKey>)`.
 * Throws when the connection has no email — a connection made before the
 * email was collected cannot authenticate and must be reconnected.
 */
export function basicAuthHeader(credentials: Credentials): string {
  const email = credentials.extra?.['email']
  if (typeof email !== 'string' || email === '') {
    throw Object.assign(
      new Error(
        'Modusign connection has no account email. Modusign authenticates API keys with HTTP Basic (email:API key); reconnect and supply the email.',
      ),
      { statusCode: 401, code: 'UNAUTHORIZED' },
    )
  }
  if (!credentials.accessToken) {
    throw Object.assign(new Error('Modusign connection has no API key.'), {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    })
  }
  return `Basic ${Buffer.from(`${email}:${credentials.accessToken}`).toString('base64')}`
}
