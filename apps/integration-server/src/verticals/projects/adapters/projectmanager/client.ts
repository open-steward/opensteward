/**
 * ProjectManager REST client.
 *
 * Authentication: Bearer token via Authorization header.
 * Pagination: OData-style $top / $skip query parameters.
 * Rate limits: 429 + 5xx trigger exponential backoff.
 *
 * Docs: https://developer.projectmanager.com/getting-started/overview
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_PATH_PREFIX } from './constants'

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

/** Wrapper type for ProjectManager list responses */
export interface PmListResponse<T> {
  success?: boolean
  hasError?: boolean
  data?: T[]
}

/** Wrapper type for ProjectManager single-object responses */
export interface PmGetResponse<T> {
  success?: boolean
  hasError?: boolean
  data?: T
}

export class ProjectManagerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`${API_PATH_PREFIX}${path}`, { params })
      return data
    })
  }
}
