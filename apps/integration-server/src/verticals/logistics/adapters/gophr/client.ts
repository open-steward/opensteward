import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { GOPHR_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const ae = err as AxiosError
      if (ae.response?.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Gophr V2 Commercial API client.
 *
 * Auth, https://developers.gophr.com/docs/authorisation.md: "You need to
 * include the key in a the `API-KEY` header for all requests." The OpenAPI
 * security scheme agrees: { "name": "API-KEY", "type": "apiKey", "in": "header" }.
 */
export class GophrClient {
  private http: AxiosInstance
  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: GOPHR_API_BASE,
      headers: {
        'API-KEY': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
