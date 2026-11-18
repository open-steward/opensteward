import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_PREFIX } from './constants'

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
 * SphereWMS REST API client.
 *
 * Authentication: `key` query parameter appended to every request.
 * Base URL: https://api.spherewms.com/v2/wms/{environment}/
 */
export class SphereWmsClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    const environment = String(credentials.extra?.['environment'] ?? '')
    if (!environment) throw new Error('spherewms requires credentials.extra.environment')
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: `${API_BASE_URL_PREFIX}/${environment}/`,
      headers: {
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { key: this.apiKey, ...params },
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { key: this.apiKey },
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
