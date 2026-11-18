/**
 * Adyen authenticates with an API key sent in the `X-API-Key` header. The
 * merchant account name is required for most write operations and lives
 * alongside the key in `Credentials.extra`.
 */

import type { Credentials } from '@opensteward/shared'
import { DEFAULT_TEST_BASE_URL } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return {
    accessToken: fields.apiKey ?? '',
    extra: {
      merchantAccount: fields.merchantAccount ?? '',
      baseUrl: fields.baseUrl ?? DEFAULT_TEST_BASE_URL,
    },
  }
}

export function merchantAccountFrom(credentials: Credentials): string {
  return String((credentials.extra as Record<string, unknown> | undefined)?.merchantAccount ?? '')
}
