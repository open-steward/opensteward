/**
 * CCAvenue authentication.
 *
 * CCAvenue's Merchant API has no OAuth and no bearer token. Each merchant is
 * issued three static credentials in M.A.R.S → Settings → API Keys:
 *
 *   - Merchant ID    (numeric account identifier, echoed in the request body)
 *   - Access Code    (sent as the plaintext `access_code` POST field)
 *   - Working Key    (a.k.a. Encryption Key — AES-128-CBC key for enc_request)
 *
 * We map these onto `Credentials` as:
 *   - accessToken          → Access Code (the value posted on every call)
 *   - extra.merchantId     → Merchant ID
 *   - extra.workingKey     → Working/Encryption Key (secret)
 *   - extra.environment    → 'sandbox' | 'production' (selects the host)
 *
 * Note: CCAvenue also requires the caller's public IP to be allow-listed in
 * the dashboard; that is an account-side setting, not part of the credential.
 */
import type { Credentials } from '@opensteward/shared'

export type CcavenueEnvironment = 'sandbox' | 'production'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantId = (fields.merchantId ?? '').trim()
  const accessCode = (fields.accessCode ?? '').trim()
  const workingKey = (fields.workingKey ?? '').trim()
  if (!merchantId) throw new Error('CCAvenue Merchant ID is required.')
  if (!accessCode) throw new Error('CCAvenue Access Code is required.')
  if (!workingKey) throw new Error('CCAvenue Working Key is required.')
  const environment: CcavenueEnvironment =
    fields.environment === 'production' ? 'production' : 'sandbox'
  return {
    accessToken: accessCode,
    extra: { merchantId, workingKey, environment },
  }
}

export function accessCodeFrom(credentials: Credentials): string {
  return credentials.accessToken
}

export function merchantIdFrom(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.merchantId ?? '')
}

export function workingKeyFrom(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.workingKey ?? '')
}

export function environmentFrom(credentials: Credentials): CcavenueEnvironment {
  const env = (credentials.extra as Record<string, unknown> | undefined)?.environment
  return env === 'production' ? 'production' : 'sandbox'
}
