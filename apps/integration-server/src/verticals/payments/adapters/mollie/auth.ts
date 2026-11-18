/**
 * Mollie authenticates with an API key (live or test, distinguished by the
 * `live_` / `test_` prefix). Submit via the Connect Link form.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: fields.apiKey ?? '' }
}
