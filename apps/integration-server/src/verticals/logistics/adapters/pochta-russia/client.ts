import axios, { type AxiosInstance } from 'axios'
import { POCHTA_RUSSIA_API_BASE, POCHTA_RUSSIA_TARIFF_BASE } from './constants'
import { authHeaders } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Pochta Rossii Otpravka REST API.
 *
 * Authentication:
 *   Authorization: AccessToken <token>
 *   X-User-Authorization: Basic <base64(login:password)>
 */
export class PochtaRussiaClient {
  private http: AxiosInstance
  private tariffHttp: AxiosInstance

  constructor(credentials: Credentials) {
    const headers = {
      ...authHeaders(credentials),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    this.http = axios.create({
      baseURL: POCHTA_RUSSIA_API_BASE,
      headers,
    })

    // Tariff API is open — no auth headers required
    this.tariffHttp = axios.create({
      baseURL: POCHTA_RUSSIA_TARIFF_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /** Tariff (rate calculation) — open endpoint, no auth. */
  async tariffGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.tariffHttp.get<T>(path, { params })
      return data
    })
  }
}
