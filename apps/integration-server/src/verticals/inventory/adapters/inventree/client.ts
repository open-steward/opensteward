import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_API_BASE_URL } from './constants'

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

/** Paginated response envelope from InvenTree (limit/offset). */
export interface InvenTreePage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export class InvenTreeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')
    const token = credentials.accessToken
    if (!token) throw new Error('inventree requires credentials.accessToken (API token)')
    this.http = axios.create({
      baseURL: `${baseUrl}/api`,
      headers: {
        Authorization: `Token ${token}`,
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

  async getPage<T>(path: string, params?: Record<string, unknown>): Promise<InvenTreePage<T>> {
    return this.get<InvenTreePage<T>>(path, params)
  }
}
