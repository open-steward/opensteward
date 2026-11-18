import axios, { type AxiosInstance } from 'axios'
import { SHIPSGO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP wrapper for the ShipsGo REST API.
 *
 * Authentication: the `authCode` query parameter is appended to every request
 * using an Axios request interceptor so callers never have to remember it.
 *
 * ShipsGo also accepts `Content-Type: application/json` for POST bodies.
 */
export class ShipsGoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SHIPSGO_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    // Inject the API key as `authCode` on every request.
    this.http.interceptors.request.use((config) => {
      config.params = {
        authCode: credentials.accessToken,
        ...config.params,
      }
      return config
    })
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
