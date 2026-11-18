import type { Credentials } from '@opensteward/shared'

/**
 * Thunes authentication (https://docs.thunes.com/money-transfer/v2/#authentication):
 * "Access to all endpoints of the API requires authentication through HTTP
 * Basic Authentication", shown as
 *
 *   curl https://${API_ENDPOINT}/ping -u "${API_KEY}:${API_SECRET}"
 *
 * with "user-ID: API key" and "password: API secret". The endpoint itself is
 * per account: "Specific details relating to the endpoints will be provided
 * upon account creation." It is kept on `credentials.extra.apiEndpoint`.
 */
export interface ThunesExtra {
  apiEndpoint: string
}

/** `https://<host>` from what the user pasted: a bare host, or a URL. */
export function normaliseEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function readEndpoint(credentials: Credentials): string | undefined {
  const v = (credentials.extra ?? {})['apiEndpoint']
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const key = (fields['apiKey'] ?? '').trim()
  const secret = (fields['apiSecret'] ?? '').trim()
  const apiEndpoint = normaliseEndpoint(fields['apiEndpoint'] ?? '')
  if (!key || !secret || !apiEndpoint) {
    throw new Error(
      'Thunes needs the API key, the API secret and the API endpoint Thunes provided.',
    )
  }
  const extra: ThunesExtra = { apiEndpoint }
  return {
    accessToken: Buffer.from(`${key}:${secret}`).toString('base64'),
    extra: { ...extra },
  }
}
