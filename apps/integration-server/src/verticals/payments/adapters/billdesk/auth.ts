/**
 * BillDesk authenticates every request with a JWS (JSON Web Signature)
 * envelope: the JSON body is signed with HMAC-SHA-256 (`alg: HS256`) using a
 * merchant-specific secret key, with the merchant `clientid` carried in the
 * JWS protected header. There is no OAuth and no token-exchange/refresh step —
 * the `clientid` + `secretkey` pair is issued by BillDesk at onboarding.
 *
 * The same `secretkey` doubles as the HMAC key for verifying inbound webhook
 * notifications, so we keep it as the primary `accessToken`. The `clientid`
 * and the chosen environment travel in `Credentials.extra`.
 *
 * Docs: https://docs.billdesk.io/reference/authentications-and-endpoints
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type BilldeskEnvironment } from './constants'

function pickEnvironment(value: string | undefined): BilldeskEnvironment {
  return value && value in HOSTS ? (value as BilldeskEnvironment) : DEFAULT_ENVIRONMENT
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = (fields.clientId ?? '').trim()
  const secretKey = (fields.secretKey ?? '').trim()
  const merchantId = (fields.merchantId ?? '').trim()
  if (!clientId) throw new Error('Client ID is required.')
  if (!secretKey) throw new Error('Secret key is required.')
  if (!merchantId) throw new Error('Merchant ID (mercid) is required.')
  return {
    accessToken: secretKey,
    extra: {
      clientId,
      merchantId,
      environment: pickEnvironment(fields.environment),
    },
  }
}
