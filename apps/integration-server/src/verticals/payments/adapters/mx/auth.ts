import type { Credentials } from '@opensteward/shared'

/**
 * MX Platform API HTTP Basic auth
 * (https://docs.mx.com/openapi/platform-api/v20250224.yaml,
 * components.securitySchemes.basicAuth): "include your Base64-encoded
 * `client_id` and `api_key` in the Authorization header of every request:
 * -H 'Authorization: Basic BASE_64_ENCODING_OF{client_id:api_key}'".
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = fields.clientId?.trim()
  const apiKey = fields.apiKey?.trim()
  if (!clientId || !apiKey) {
    throw new Error('MX needs both a client_id and an api_key (Basic client_id:api_key).')
  }
  return { accessToken: Buffer.from(`${clientId}:${apiKey}`).toString('base64') }
}
