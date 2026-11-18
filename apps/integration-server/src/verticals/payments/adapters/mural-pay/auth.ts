import type { Credentials } from '@opensteward/shared'

/**
 * Mural Pay uses an API key, "provided via Bearer Authentication in the
 * request header for *all* requests"
 * (https://developers.muralpay.com/docs/get-api-key.md). The connect form's
 * only field is `apiKey`.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) {
    throw Object.assign(new Error('Mural Pay connection is missing: apiKey'), { statusCode: 400 })
  }
  return { accessToken: apiKey }
}
