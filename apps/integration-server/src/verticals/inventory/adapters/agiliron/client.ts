import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class AgilironClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    const company = String(credentials.extra?.['company'] ?? '')
    if (!company) throw new Error('agiliron requires credentials.extra.company (subdomain)')
    this.apiKey = credentials.accessToken
    const baseURL = API_BASE_URL_TEMPLATE.replace('{company}', company)
    this.http = axios.create({
      baseURL,
      headers: {
        apiKey: this.apiKey,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET with the API key injected as both the `key` query param and the
   * `apiKey` header (Agiliron accepts either, we send both for safety).
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { key: this.apiKey, ...params },
      })
      return data
    })
  }
}
