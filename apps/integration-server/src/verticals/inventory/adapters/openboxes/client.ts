import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * OpenBoxes HTTP client.
 *
 * OpenBoxes uses session cookie auth (JSESSIONID).
 * credentials.accessToken holds the session ID.
 * credentials.extra.baseUrl holds the full API base URL
 * (e.g. https://demo.openboxes.com/openboxes/api).
 */
export class OpenboxesClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? '')
    if (!baseUrl) throw new Error('openboxes requires credentials.extra.baseUrl')
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Cookie: `JSESSIONID=${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
