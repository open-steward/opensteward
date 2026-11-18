/**
 * Belvo authenticates with HTTP Basic auth using a key pair generated in the
 * dashboard:
 *   username ← secretId
 *   password ← secretPassword
 * sent as `Authorization: Basic base64(secretId:secretPassword)` on every
 * request. There is no OAuth / token-exchange / refresh step.
 *
 * We keep `secretPassword` as the primary `accessToken`; the `secretId` and
 * the chosen environment travel in `Credentials.extra`.
 *
 * Docs: https://developers.belvo.com/reference/authentication-1
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type BelvoEnvironment } from './constants'

function pickEnvironment(value: string | undefined): BelvoEnvironment {
  return value && value in HOSTS ? (value as BelvoEnvironment) : DEFAULT_ENVIRONMENT
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const secretId = (fields.secretId ?? '').trim()
  const secretPassword = (fields.secretPassword ?? '').trim()
  if (!secretId) throw new Error('Secret ID is required.')
  if (!secretPassword) throw new Error('Secret password is required.')
  return {
    accessToken: secretPassword,
    extra: {
      secretId,
      environment: pickEnvironment(fields.environment),
    },
  }
}
