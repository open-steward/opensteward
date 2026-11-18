/**
 * Juspay Express Checkout authenticates each REST call with HTTP Basic auth,
 * where the username is the merchant API key and the password is empty:
 *   Authorization: Basic base64("<API_KEY>:")
 *
 * Two extra headers travel on every request:
 *   x-merchantid  ← the merchant id from the Juspay dashboard
 *   x-routing-id  ← a per-customer routing hint (defaults to the order's
 *                   customer id; we fall back to the merchant id)
 *
 * There is no OAuth / token-exchange step and no refresh: the API key is a
 * long-lived static credential. We keep it as the primary `accessToken`; the
 * merchant id and chosen environment travel in `Credentials.extra`.
 *
 * Docs: https://juspay.io/in/docs/api-reference/docs/express-checkout/authentication
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type JuspayEnvironment } from './constants'

function pickEnvironment(value: string | undefined): JuspayEnvironment {
  return value && value in HOSTS ? (value as JuspayEnvironment) : DEFAULT_ENVIRONMENT
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const merchantId = (fields.merchantId ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  if (!merchantId) throw new Error('Merchant ID (x-merchantid) is required.')
  return {
    accessToken: apiKey,
    extra: {
      merchantId,
      environment: pickEnvironment(fields.environment),
    },
  }
}
