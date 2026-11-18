/**
 * Worldpay Access uses HTTP Basic auth derived from a username:password
 * pair issued in the Worldpay portal. Newer "Worldpay for Platforms"
 * deployments use OAuth2 client-credentials — the adapter accepts both,
 * preferring Basic when a username is set.
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type WorldpayEnvironment } from './constants'

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const environment = (fields.environment as WorldpayEnvironment) ?? DEFAULT_ENVIRONMENT
  if (fields.username && fields.password) {
    return {
      accessToken: Buffer.from(`${fields.username}:${fields.password}`).toString('base64'),
      extra: { environment, authStyle: 'basic' },
    }
  }
  if (fields.clientId && fields.clientSecret) {
    const { data } = await axios.post<{ access_token: string; expires_in: number }>(
      `${HOSTS[environment]}/oauth2/token`,
      'grant_type=client_credentials',
      {
        auth: { username: fields.clientId, password: fields.clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    )
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      extra: {
        environment,
        authStyle: 'bearer',
        clientId: fields.clientId,
        clientSecret: fields.clientSecret,
      },
    }
  }
  throw new Error('Worldpay requires either (username + password) or (clientId + clientSecret).')
}
