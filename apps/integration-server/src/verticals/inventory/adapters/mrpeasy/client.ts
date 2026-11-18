import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

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

export class MrpeasyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // credentials.accessToken is already base64("apiKey:apiSecret")
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a paginated list resource using Range header pagination.
   * Returns the raw array of items from the response body.
   */
  async getList<T>(path: string, offset = 0, limit = DEFAULT_PAGE_SIZE, params?: Record<string, unknown>): Promise<T[]> {
    return withRetry(async () => {
      const end = offset + limit - 1
      const { data } = await this.http.get<T[]>(path, {
        params,
        headers: { Range: `items=${offset}-${end}` },
      })
      return Array.isArray(data) ? data : []
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
