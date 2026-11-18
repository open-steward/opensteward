/**
 * Tyro Connect REST client (GET only; the adapter reads the Reporting API).
 *
 * "You must pass the retrieved Access Token as a Bearer token in the
 *  Authorization header of your Tyro Connect REST API request."
 *  https://docs.connect.tyro.com/docs/getting-started/authentication/client-credentials.md
 */
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

export class TyroClient {
  constructor(
    private readonly credentials: Credentials,
    private readonly fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  async get<T>(path: string, query: Record<string, string | number>): Promise<T> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) qs.set(k, String(v))
    const url = `${API_BASE_URL}${path}?${qs.toString()}`
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) return (await res.json()) as T
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600)
      if (retryable && attempt < 3) {
        await this.sleep(2 ** attempt * 1000)
        continue
      }
      const text = await res.text().catch(() => '')
      throw Object.assign(new Error(`Tyro GET ${path} returned ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
  }
}
