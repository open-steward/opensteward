/**
 * wFirma API key credential helper.
 *
 * wFirma uses three header-based keys (no OAuth flow):
 *   accessKey  — per-user access key
 *   secretKey  — per-user secret key
 *   appKey     — per-integration application key assigned by wFirma
 *
 * All three are stored in `credentials.extra` and the `accessToken` field
 * carries the `accessKey` value for compatibility with the shared store.
 *
 * Docs: https://doc.wfirma.pl/#autoryzacja
 */

import type { Credentials } from '../../adapter/interface'

/**
 * Build the three wFirma auth headers from stored credentials.
 *
 * `credentials.accessToken` holds the `accessKey`.
 * `credentials.extra.secretKey` holds the secret key.
 * `credentials.extra.appKey` holds the application key.
 */
export function buildAuthHeaders(credentials: Credentials): Record<string, string> {
  const extra = (credentials.extra ?? {}) as Record<string, string>
  return {
    accessKey: credentials.accessToken,
    secretKey: extra['secretKey'] ?? '',
    appKey: extra['appKey'] ?? '',
  }
}

/**
 * Exchange raw user-supplied fields into a Credentials object.
 * Called by the simpleApiKey-style form during Connect Link setup.
 */
export function buildCredentialsFromFields(fields: Record<string, string>): Credentials {
  const accessKey = (fields['accessKey'] ?? fields['apiKey'] ?? '').trim()
  const secretKey = (fields['secretKey'] ?? '').trim()
  const appKey = (fields['appKey'] ?? '').trim()
  if (!accessKey || !secretKey || !appKey) {
    throw new Error('accessKey, secretKey, and appKey are all required for wFirma.')
  }
  return {
    accessToken: accessKey,
    extra: { secretKey, appKey },
  }
}
