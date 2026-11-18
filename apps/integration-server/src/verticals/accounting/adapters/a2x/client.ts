/**
 * A2X REST API client.
 *
 * All requests are authenticated with a Bearer token in the Authorization
 * header. The base URL is https://my.a2xaccounting.com/api/v1 and responses
 * are JSON.
 *
 * Pagination: A2X uses page-based pagination. List responses include:
 *   { data: T[], meta: { current_page, per_page, total, last_page } }
 */

import axios, { type AxiosInstance } from 'axios'
import { A2X_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface A2xListMeta {
  current_page: number
  per_page: number
  total: number
  last_page: number
}

export interface A2xListResponse<T> {
  data: T[]
  meta: A2xListMeta
}

export class A2xClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: A2X_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async list<T>(
    path: string,
    page: number,
    perPage: number,
    extra?: Record<string, unknown>,
  ): Promise<A2xListResponse<T>> {
    return this.get<A2xListResponse<T>>(path, { page, per_page: perPage, ...extra })
  }
}
