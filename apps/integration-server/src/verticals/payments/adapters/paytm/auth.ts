/**
 * Paytm Payment Gateway authenticates every server-to-server call with a
 * per-request checksum (`head.signature`) computed over the request body using
 * the merchant's Merchant Key. There is no OAuth and no bearer token to
 * refresh — the merchant supplies a fixed (MID, Merchant Key) pair.
 *
 * The Merchant Key doubles as the AES key for both request signing and
 * callback/webhook signature verification, so we keep it as the primary
 * `accessToken`. The MID and the chosen environment travel in
 * `Credentials.extra`.
 *
 * Docs: https://business.paytm.com/docs/checksum/
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type PaytmEnvironment } from './constants'

function pickEnvironment(value: string | undefined): PaytmEnvironment {
  return value && value in HOSTS ? (value as PaytmEnvironment) : DEFAULT_ENVIRONMENT
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const mid = (fields.mid ?? '').trim()
  const merchantKey = (fields.merchantKey ?? '').trim()
  const clientId = (fields.clientId ?? '').trim()
  if (!mid) throw new Error('Merchant ID (MID) is required.')
  if (!merchantKey) throw new Error('Merchant Key is required.')
  return {
    accessToken: merchantKey,
    extra: {
      mid,
      environment: pickEnvironment(fields.environment),
      // Only merchants with more than one Merchant Key need this — see
      // credentialFields()'s helpText. Omitted (not empty-stringed) when
      // blank so PaytmClient callers can tell "not configured" from "set to
      // an empty client id".
      ...(clientId ? { clientId } : {}),
    },
  }
}
