/**
 * HTTP client for the Abacus ERP REST API (OData v4).
 *
 * The Abacus API base URL is tenant-specific and stored in
 * `credentials.tenantId` as the scheme+host (e.g. "https://mycompany.abacus.ch").
 * All REST entity endpoints are under `{baseUrl}/api/entity/v1/`.
 *
 * Authentication: Bearer token in the Authorization header.
 * Pagination: OData $top / $skip query parameters.
 */

import axios, { type AxiosInstance } from 'axios'
import { ABACUS_API_PATH } from './constants'
import { normaliseTenantBaseUrl } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** OData list response envelope from Abacus. */
export interface AbacusListResponse<T> {
  /** The array of items returned by the OData query. */
  value: T[]
  /** '@odata.count' — total count when $count=true is requested. */
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

export class AbacusClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // `extra.tenantBaseUrl` is recorded at connect time; `tenantId` held the
    // same value for connections made before that.
    const stored = credentials.extra?.['tenantBaseUrl']
    const raw = typeof stored === 'string' && stored.trim() ? stored : credentials.tenantId
    if (!raw || !raw.trim()) {
      throw new Error(
        'Abacus server URL is missing from the connection; reconnect it so the server URL is recorded.',
      )
    }
    const baseUrl = normaliseTenantBaseUrl(raw)
    this.http = axios.create({
      baseURL: `${baseUrl}${ABACUS_API_PATH}/`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Fetch a list of OData entities.
   *
   * @param resource  OData entity set name, e.g. "Invoices"
   * @param params    OData query parameters ($top, $skip, $filter, $select, etc.)
   */
  async list<T>(resource: string, params?: Record<string, unknown>): Promise<AbacusListResponse<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get<AbacusListResponse<T>>(resource, { params })
      return data
    })
  }

  /**
   * Fetch a single entity by its primary key.
   *
   * @param resource  OData entity set name, e.g. "Invoices"
   * @param id        Entity primary key (numeric string)
   */
  async get<T>(resource: string, id: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`${resource}(${id})`)
      return data
    })
  }

  /**
   * Create a new entity via HTTP POST.
   */
  async post<T>(resource: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(resource, body)
      return data
    })
  }

  /**
   * Update an entity via HTTP PATCH (OData partial update).
   */
  async patch<T>(resource: string, id: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(`${resource}(${id})`, body)
      return data
    })
  }

  /**
   * Delete an entity via HTTP DELETE.
   */
  async delete(resource: string, id: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`${resource}(${id})`)
    })
  }
}
