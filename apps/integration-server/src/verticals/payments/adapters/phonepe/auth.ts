/**
 * PhonePe Standard Checkout V2 authentication.
 *
 * PhonePe is an "api_key" adapter from the operator's point of view — the
 * merchant pastes a static credential set (Client ID + Client Secret +
 * Client Version) rather than running a browser OAuth dance. But the wire
 * protocol is OAuth client-credentials: those three values are POSTed,
 * form-encoded, to the token endpoint to mint a short-lived `O-Bearer`
 * access token that every Payment-Gateway call carries.
 *
 * We exchange the static credentials for a token at Connect time and on
 * refresh, keeping the long-lived Client ID/Secret/Version in
 * `Credentials.extra` so `refreshCredentials` can re-run the grant without
 * re-prompting the merchant. The chosen environment also rides in `extra`.
 *
 * Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/authorization
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  HOSTS,
  OAUTH_TOKEN_PATH,
  type PhonepeEnvironment,
} from './constants'

interface PhonepeTokenResponse {
  access_token: string
  encrypted_access_token?: string
  /** Seconds-to-live; PhonePe often sends null and relies on `expires_at`. */
  expires_in?: number | null
  issued_at?: number
  /** Absolute expiry, epoch SECONDS. */
  expires_at?: number
  session_expires_at?: number
  token_type?: string
}

/** Credential fields collected on the Connect Link form. */
export interface PhonepeFields {
  clientId: string
  clientSecret: string
  clientVersion: string
  environment: PhonepeEnvironment
}

export function pickEnvironment(value: string | undefined): PhonepeEnvironment {
  return value && value in HOSTS ? (value as PhonepeEnvironment) : DEFAULT_ENVIRONMENT
}

function readFields(fields: Record<string, string>): PhonepeFields {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  const clientVersion = (fields.clientVersion ?? '').trim() || '1'
  if (!clientId) throw new Error('PhonePe Client ID is required.')
  if (!clientSecret) throw new Error('PhonePe Client Secret is required.')
  return {
    clientId,
    clientSecret,
    clientVersion,
    environment: pickEnvironment(fields.environment),
  }
}

/** POST the client-credentials grant and shape the token into Credentials. */
async function requestToken(f: PhonepeFields): Promise<Credentials> {
  const url = `${HOSTS[f.environment].oauth}${OAUTH_TOKEN_PATH}`
  const body = new URLSearchParams({
    client_id: f.clientId,
    client_version: f.clientVersion,
    client_secret: f.clientSecret,
    grant_type: 'client_credentials',
  })
  const { data } = await axios.post<PhonepeTokenResponse>(url, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })

  // PhonePe returns `expires_at` as epoch SECONDS; fall back to expires_in.
  const expiresAt =
    typeof data.expires_at === 'number'
      ? new Date(data.expires_at * 1000)
      : typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined

  return {
    accessToken: data.access_token,
    expiresAt,
    extra: {
      clientId: f.clientId,
      clientSecret: f.clientSecret,
      clientVersion: f.clientVersion,
      environment: f.environment,
    },
  }
}

/** Exchange Connect-form fields for an O-Bearer access token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return requestToken(readFields(fields))
}

/** Re-mint the access token from the stored client credentials in `extra`. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  const clientId = String(extra.clientId ?? '')
  const clientSecret = String(extra.clientSecret ?? '')
  // No stored client credentials to re-grant with → keep the current token.
  if (!clientId || !clientSecret) return credentials
  return requestToken({
    clientId,
    clientSecret,
    clientVersion: String(extra.clientVersion ?? '1'),
    environment: pickEnvironment(extra.environment as string | undefined),
  })
}
