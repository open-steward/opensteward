/**
 * Toast authentication helpers.
 *
 * Toast issues machine-client tokens: "Use the POST HTTP method to make an
 * authentication request. Include the HTTP Content-Type header field and set
 * its value to application/json. Include a JSON object including your client
 * identifier and client secret" (https://doc.toasttab.com/doc/devguide/authentication.html).
 * The body is the Authentication API `AuthenticationRequest` — `clientId`,
 * `clientSecret` and `userAccessType` ("Always include the `userAccessType`
 * value and set it to `TOAST_MACHINE_CLIENT`.") — and the response is an
 * `AuthenticationResponse` whose `token` holds `accessToken` and `expiresIn`
 * ("The number of seconds that the authentication token is valid.").
 * https://doc.toasttab.com/openapi/authentication/operation/authenticationLoginPost/
 *
 * That is not the RFC 6749 form post (`grant_type=client_credentials`,
 * `access_token`) the shared `oauth2ClientCredentials` template sends, so the
 * Connect form below makes the documented request itself.
 */

import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { TOKEN_PATH, isToastEnvironment, toastHost } from './constants'

interface ToastTokenResponse {
  token: {
    accessToken: string
    tokenType: string
    expiresIn: number
  }
  status: string
}

/**
 * Exchange is not supported — Toast uses client credentials.
 */
export function exchangeCode(): never {
  throw new Error(
    'Toast adapter v1 does not support interactive OAuth. ' +
      'Use POST /v1/connections with { accessToken, extra: { clientId, ' +
      'clientSecret, restaurantId, environment } }.',
  )
}

/** POST /authentication/v1/authentication/login on the connection's host. */
async function login(
  clientId: string,
  clientSecret: string,
  environment: unknown,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const { data } = await axios.post<ToastTokenResponse>(
    `${toastHost(environment)}${TOKEN_PATH}`,
    { clientId, clientSecret, userAccessType: 'TOAST_MACHINE_CLIENT' },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return {
    accessToken: data.token.accessToken,
    expiresAt: new Date(Date.now() + data.token.expiresIn * 1000),
  }
}

/**
 * Refresh an access token using the client credentials grant.
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Toast refresh requires clientId and clientSecret in credentials.extra')
  }

  const { accessToken, expiresAt } = await login(
    clientId,
    clientSecret,
    credentials.extra?.['environment'],
  )

  return {
    accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt,
    extra: {
      ...credentials.extra,
    },
  }
}

/**
 * Connect-form fields. Every Toast API request carries the
 * `Toast-Restaurant-External-ID` header ("The Toast POS GUID of the restaurant
 * that the configuration applies to.", required on every operation), so the
 * restaurant GUID is collected with the client credentials.
 */
export const CREDENTIAL_FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
  {
    name: 'restaurantId',
    label: 'Restaurant GUID',
    type: 'text',
    required: true,
    helpText: 'Sent as the Toast-Restaurant-External-ID header on every request.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: false,
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Sandbox' },
    ],
  },
]

/** Validate the Connect form and log in with the documented JSON request. */
export async function exchangeCredentials(input: Record<string, string>): Promise<Credentials> {
  const clientId = (input?.['clientId'] ?? '').trim()
  const clientSecret = input?.['clientSecret'] ?? ''
  const restaurantId = (input?.['restaurantId'] ?? '').trim()
  if (!clientId || !clientSecret) throw new Error('Client ID and client secret are required.')
  if (!restaurantId) throw new Error('Restaurant GUID is required.')
  const environment = (input?.['environment'] ?? '').trim() || 'production'
  // Only the select's own options: anything else would silently log in
  // against production.
  if (!isToastEnvironment(environment))
    throw new Error(`Unknown Toast environment "${environment}": use production or sandbox.`)
  const { accessToken, expiresAt } = await login(clientId, clientSecret, environment)
  return {
    accessToken,
    expiresAt,
    extra: { clientId, clientSecret, restaurantId, environment },
  }
}
