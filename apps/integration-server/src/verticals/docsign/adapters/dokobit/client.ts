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
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * The Portal API takes the key as the `access_token` query parameter: the
 * documentation page's own client is configured with
 * `authentication_delivery = 'query'` and `api_key_parameter = 'access_token'`
 * (https://beta.dokobit.com/api/doc), and Dokobit's example client builds
 * `/api/<action>.json?access_token=...`.
 */
export class DokobitClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials) {
    this.accessToken = credentials.accessToken
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...params, access_token: this.accessToken },
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: { access_token: this.accessToken },
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
