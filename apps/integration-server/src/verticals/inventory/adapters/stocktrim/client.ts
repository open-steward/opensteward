import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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
 * StockTrim HTTP client.
 *
 * Authentication uses two custom headers per the StockTrim API spec:
 *   api-auth-id        — tenant ID (stored as credentials.accessToken)
 *   api-auth-signature — tenant name (stored as credentials.extra.tenantName)
 */
export class StockTrimClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const tenantName = String(credentials.extra?.['tenantName'] ?? '')
    if (!credentials.accessToken) throw new Error('stocktrim requires credentials.accessToken (tenantId)')
    if (!tenantName) throw new Error('stocktrim requires credentials.extra.tenantName')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'api-auth-id': credentials.accessToken,
        'api-auth-signature': tenantName,
        Accept: 'application/json',
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
