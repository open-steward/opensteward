import axios, { type AxiosInstance } from 'axios'
import { withRetry as withRetryBase } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { SINAY_TRACKING_API_BASE, SINAY_MGMT_API_BASE, API_KEY_HEADER } from './constants'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * HTTP client for the Sinay Container Tracking API
 * (GET /shipment and related read-only endpoints).
 */
export class SinayTrackingClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SINAY_TRACKING_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [API_KEY_HEADER]: credentials.accessToken,
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}

/**
 * HTTP client for the Sinay Shipment Management API
 * (POST /public/shipments, POST /public/shipments/search, etc.).
 */
export class SinayMgmtClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SINAY_MGMT_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [API_KEY_HEADER]: credentials.accessToken,
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

  async delete<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { data: body })
      return data
    })
  }
}
