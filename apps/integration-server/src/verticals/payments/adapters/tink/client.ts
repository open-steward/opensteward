/**
 * Tink REST client (GET only; the adapter reads settlement accounts).
 *
 * Every endpoint it calls lists "Client token" under "ACCEPTED TOKEN TYPES"
 * (https://docs.tink.com/api#payment/settlement-accounts), sent as a bearer
 * token: `-H 'Authorization: Bearer {YOUR_CLIENT_ACCESS_TOKEN}'`
 * (https://docs.tink.com/resources/api-setup/get-access-token).
 */
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

export class TinkClient {
  constructor(
    private readonly credentials: Credentials,
    private readonly fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
  ) {}

  async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, String(v))
    const q = qs.toString()
    const url = `${API_BASE_URL}${path}${q ? `?${q}` : ''}`
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`Tink GET ${path} returned ${res.status}: ${text.slice(0, 500)}`),
        {
          statusCode: res.status,
        },
      )
    }
    return (await res.json()) as T
  }
}
