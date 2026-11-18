/**
 * PayPal OAuth2 client-credentials flow.
 *
 * The merchant generates a REST API app in the PayPal developer dashboard;
 * the resulting `clientId` + `clientSecret` are exchanged for a 9-hour
 * bearer access token at `/v1/oauth2/token`. The adapter refreshes by
 * re-running the exchange — there is no refresh-token grant on
 * client-credentials.
 *
 * Docs: https://developer.paypal.com/api/rest/authentication/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { HOSTS, type PayPalEnvironment } from './constants'

export async function fetchToken(
  clientId: string,
  clientSecret: string,
  environment: PayPalEnvironment,
): Promise<Credentials> {
  const baseUrl = HOSTS[environment]
  const { data } = await axios.post<{
    access_token: string
    expires_in: number
    scope?: string
  }>(`${baseUrl}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: { username: clientId, password: clientSecret },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: { clientId, clientSecret, environment },
  }
}
