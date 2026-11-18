import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        // Respect Retry-After if provided, else exponential back-off
        const retryAfter = axiosErr.response?.headers?.['retry-after']
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : Math.pow(2, i) * 1000
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class EZOClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subdomain = String(credentials.extra?.['subdomain'] ?? '')
    if (!subdomain) throw new Error('ezofficeinventory requires credentials.extra.subdomain')
    this.http = axios.create({
      baseURL: `https://${subdomain}.ezofficeinventory.com${API_BASE_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
