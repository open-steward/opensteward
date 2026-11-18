/**
 * Paddle Billing API uses Bearer-token auth (the API key is the bearer).
 * Sandbox + live use different keys.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, type PaddleEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.apiKey ?? '',
    extra: { environment: (fields.environment as PaddleEnvironment) ?? DEFAULT_ENVIRONMENT },
  }
}
