import axios, { type AxiosInstance } from 'axios'
import { TRIMBLE_TRUCKMATE_API_BASE, TRIMBLE_TRUCKMATE_TM_PATH } from './constants'
import { authHeader, isTokenExpired, refreshCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Trimble TruckMate REST API.
 *
 * TruckMate exposes three service prefixes:
 *   /tm          – transactional (orders, trips, tracking)
 *   /masterData  – reference data (clients, vendors, drivers, sites)
 *   /finance     – invoices, payments
 *
 * By default the client targets /tm; call `forMasterData()` or
 * `forFinance()` to obtain a client scoped to the other services.
 */
export class TrimbleTruckmateClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials, basePath: string = TRIMBLE_TRUCKMATE_TM_PATH) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: `${TRIMBLE_TRUCKMATE_API_BASE}${basePath}`,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private async ensureAuth(): Promise<void> {
    if (isTokenExpired(this.credentials)) {
      this.credentials = await refreshCredentials(this.credentials)
      this.http.defaults.headers.common['Authorization'] = authHeader(this.credentials.accessToken)
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      await this.ensureAuth()
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.ensureAuth()
      await this.http.delete(path)
    })
  }
}
