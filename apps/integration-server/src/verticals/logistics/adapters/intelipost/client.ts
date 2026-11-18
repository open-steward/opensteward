import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { INTELIPOST_API_BASE } from './constants'
import { apiKeyHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Check whether an Axios error is a rate-limit response (HTTP 429).
 */
function isRateLimit(err: unknown): boolean {
  const axiosErr = err as AxiosError
  return axiosErr?.response?.status === 429
}

export class IntelipostClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: INTELIPOST_API_BASE,
      headers: {
        ...apiKeyHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.get<T>(path, { params })
        return data
      } catch (err) {
        if (isRateLimit(err)) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        throw err
      }
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      try {
        const { data } = await this.http.post<T>(path, body)
        return data
      } catch (err) {
        if (isRateLimit(err)) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        throw err
      }
    })
  }
}
