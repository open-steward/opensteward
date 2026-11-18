/**
 * Unthread API client.
 *
 * Auth: X-Api-Key header with service account API key.
 * Base URL: https://api.unthread.io/api
 *
 * List endpoints use POST + cursor pagination:
 *   { limit, cursor, order, where, select }
 * Response: { data: T[], totalCount: number, cursors: { hasNext, next?, ... } }
 */
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

export interface UnthreadListBody {
  limit?: number
  cursor?: string
  order?: Array<{ field: string; descending?: boolean }>
  where?: Array<{ field: string; operator: string; value: unknown }>
  select?: string[]
}

export interface UnthreadListResponse<T> {
  data: T[]
  totalCount: number
  cursors: {
    hasNext: boolean
    hasPrevious: boolean
    next?: string
    previous?: string
  }
}

export class UnthreadClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Api-Key': credentials.accessToken,
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

  async postList<T>(path: string, body: UnthreadListBody): Promise<UnthreadListResponse<T>> {
    return withRetry(async () => {
      const { data } = await this.http.post<UnthreadListResponse<T>>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
