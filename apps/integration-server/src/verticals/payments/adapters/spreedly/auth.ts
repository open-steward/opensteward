/**
 * Spreedly authentication.
 *
 * Every Spreedly Core API call uses HTTP basic authentication over HTTPS:
 *   - username = the **environment key** of the target environment
 *   - password = one of your organization's **access secrets**
 *
 *   curl https://core.spreedly.com/v1/gateways.json -u 'env_key:access_secret'
 *
 * There is no OAuth and no token to refresh. We collect both halves on the
 * Connect Link form, store the environment key as `accessToken` and the
 * access secret on `extra.accessSecret`, and rebuild the basic-auth header
 * from those at request time.
 *
 * Docs: https://docs.spreedly.com/basics/credentials/
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const environmentKey = (fields.environmentKey ?? '').trim()
  const accessSecret = (fields.accessSecret ?? '').trim()
  if (!environmentKey) throw new Error('Spreedly environment key is required.')
  if (!accessSecret) throw new Error('Spreedly access secret is required.')
  return {
    accessToken: environmentKey,
    extra: { accessSecret },
  }
}
