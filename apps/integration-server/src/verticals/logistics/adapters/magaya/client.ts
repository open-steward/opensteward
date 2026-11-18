import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { MAGAYA_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class MagayaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: MAGAYA_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    this.http.interceptors.response.use(
      (res) => res,
      async (err: AxiosError) => {
        if (err.response?.status === 429) {
          const retryAfter = Number(err.response.headers['retry-after'] ?? 1)
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        }
        return Promise.reject(err)
      },
    )
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
