import axios, { type AxiosInstance } from 'axios'
import { ESHIPZ_API_BASE_V1, ESHIPZ_API_BASE_V2 } from './constants'
import { authHeaders } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Low-level HTTP client for the eShipz API.
 * Manages separate v1 / v2 Axios instances since the base paths differ.
 */
export class EshipzClient {
  private v1: AxiosInstance
  private v2: AxiosInstance

  constructor(credentials: Credentials) {
    const headers = authHeaders(credentials.accessToken)
    this.v1 = axios.create({ baseURL: ESHIPZ_API_BASE_V1, headers })
    this.v2 = axios.create({ baseURL: ESHIPZ_API_BASE_V2, headers })
  }

  async getV1<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v1.get<T>(path, { params })
      return data
    })
  }

  async postV1<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v1.post<T>(path, body)
      return data
    })
  }

  async getV2<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v2.get<T>(path, { params })
      return data
    })
  }

  async postV2<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.v2.post<T>(path, body)
      return data
    })
  }
}
