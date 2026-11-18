/**
 * Spree Commerce Platform API client.
 *
 * Spree's Platform API (v2) uses JSON:API-style responses by default:
 *
 *   GET /api/v2/platform/products → { data: [...], meta: { count, total_count, total_pages } }
 *   GET /api/v2/platform/products/:id → { data: { id, type, attributes, relationships } }
 *
 * This client normalises responses: list endpoints return `{ items, totalCount }`,
 * single-resource endpoints return the unwrapped attributes + id object.
 *
 * Auth: `Authorization: Bearer {token}` header.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_NAMESPACE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface SpreeListResult<T> {
  items: T[]
  totalCount: number
  currentPage: number
  pageSize: number
}

/**
 * JSON:API resource object shape returned by Spree Platform API.
 */
export interface SpreeJsonApiResource {
  id: string
  type: string
  attributes: Record<string, unknown>
  relationships?: Record<string, unknown>
}

/**
 * Flatten a JSON:API resource into a plain object with `id` merged in.
 */
function flattenResource(resource: SpreeJsonApiResource): Record<string, unknown> {
  return {
    id: resource.id,
    ...resource.attributes,
    _relationships: resource.relationships,
  }
}

export class SpreeClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('SpreeClient: credentials.accessToken is required')
    }
    if (!rawBase) {
      throw new Error(
        'SpreeClient: credentials.extra.baseUrl is required (e.g. https://myspree.example)',
      )
    }

    this.baseUrl = `${rawBase.replace(/\/$/, '')}/${API_NAMESPACE}`
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T = Record<string, unknown>>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get(path, { params })
      // Single resource response: { data: { id, type, attributes } }
      if (data?.data && !Array.isArray(data.data) && data.data.attributes) {
        return flattenResource(data.data) as T
      }
      return data as T
    })
  }

  async post<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post(path, body)
      if (data?.data && !Array.isArray(data.data) && data.data.attributes) {
        return flattenResource(data.data) as T
      }
      return data as T
    })
  }

  async patch<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch(path, body)
      if (data?.data && !Array.isArray(data.data) && data.data.attributes) {
        return flattenResource(data.data) as T
      }
      return data as T
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper that handles Spree's paginated JSON:API list responses.
   *
   *   GET /api/v2/platform/products?page=1&per_page=25
   *   → { data: [...], meta: { count, total_count, total_pages } }
   */
  async list<T = Record<string, unknown>>(
    path: string,
    options: {
      page?: number
      perPage?: number
      filter?: Record<string, string | number>
      include?: string
    } = {},
  ): Promise<SpreeListResult<T>> {
    const page = options.page ?? 1
    const perPage = Math.min(options.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      page,
      per_page: perPage,
    }
    if (options.include) {
      params['include'] = options.include
    }
    // Spree Platform API filtering: filter[field]=value
    if (options.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        params[`filter[${key}]`] = value
      }
    }

    const raw = await withRetry(async () => {
      const { data } = await this.http.get(path, { params })
      return data as {
        data?: SpreeJsonApiResource[]
        meta?: { count?: number; total_count?: number; total_pages?: number }
      }
    })

    const items = (raw.data ?? []).map(flattenResource) as T[]
    return {
      items,
      totalCount: raw.meta?.total_count ?? items.length,
      currentPage: page,
      pageSize: perPage,
    }
  }
}
