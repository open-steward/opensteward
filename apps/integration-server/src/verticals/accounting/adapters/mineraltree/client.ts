/**
 * MineralTree HTTP client.
 *
 * Auth: session token stored in `credentials.accessToken`, sent as
 * `If-Match` header on every request (per MineralTree API spec).
 *
 * Base URL: stored in `credentials.extra.baseUrl`; falls back to the
 * default SaaS URL when not present.
 *
 * Company ID: stored in `credentials.extra.companyId`; used to build
 * entity paths like `/mtapi/base/services/bill/{companyId}`.
 */

import axios, { type AxiosInstance } from 'axios'
import { MINERALTREE_API_BASE_DEFAULT, MINERALTREE_SERVICES_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class MineralTreeClient {
  private http: AxiosInstance
  readonly companyId: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const baseUrl = extra['baseUrl'] ?? MINERALTREE_API_BASE_DEFAULT
    this.companyId = extra['companyId'] ?? ''

    this.http = axios.create({
      baseURL: `${baseUrl}${MINERALTREE_SERVICES_PATH}/`,
      headers: {
        // Session token goes in If-Match per MineralTree API spec
        'If-Match': credentials.accessToken,
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

  /**
   * POST to the MineralTree search endpoint for an entity type.
   * Returns an array of matching objects.
   */
  async search<T>(
    entityType: string,
    query: string,
    page: number,
    count: number,
  ): Promise<T[]> {
    return withRetry(async () => {
      const { data } = await this.http.post<T[]>(
        `search/${this.companyId}/objects`,
        { view: entityType, query, page, count },
      )
      return Array.isArray(data) ? data : []
    })
  }
}
