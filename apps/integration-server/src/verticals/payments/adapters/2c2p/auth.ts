/**
 * 2C2P authenticates with a merchant key pair, not OAuth:
 *   merchantID  ← public merchant identifier, sent in every JWT claim set
 *   secretKey   ← HMAC key that signs each request JWS (and verifies the
 *                 backend-notification JWS)
 *
 * There is no token-exchange step and nothing to refresh. We keep the
 * secret key as the primary `accessToken` (it is the sole shared secret),
 * and carry the merchant id + chosen environment in `Credentials.extra`.
 *
 * Docs: https://developer.2c2p.com/docs/json-web-tokens-jwt
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type TwoC2PEnvironment } from './constants'

export function pickEnvironment(value: string | undefined): TwoC2PEnvironment {
  return value && value in HOSTS ? (value as TwoC2PEnvironment) : DEFAULT_ENVIRONMENT
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantId = (fields.merchantID ?? '').trim()
  const secretKey = (fields.secretKey ?? '').trim()
  if (!merchantId) throw new Error('Merchant ID is required.')
  if (!secretKey) throw new Error('Secret key is required.')
  return {
    accessToken: secretKey,
    extra: {
      merchantId,
      environment: pickEnvironment(fields.environment),
    },
  }
}
