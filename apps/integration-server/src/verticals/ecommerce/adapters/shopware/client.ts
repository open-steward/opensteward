/**
 * Shopware 6 Admin API client.
 *
 * Features:
 *  - Bearer auth header from an OAuth2 access token.
 *  - Retries with exponential backoff on 429 and 5xx.
 *  - `search` helper that wraps Shopware's POST /search/{entity}
 *    pattern with DAL criteria.
 *
 * Shopware 6 API conventions:
 *  - All entity endpoints live under `/api/{entity}` (plural kebab).
 *  - POST for creation, PATCH for updates (not PUT).
 *  - POST `/api/search/{entity}` for listing/filtering.
 *  - Responses wrap entities in `{ data: [...] }` for lists,
 *    `{ data: {...} }` for single.
 *  - UUIDs everywhere (hex format, no dashes in some contexts).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

export interface ShopwareListResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

/**
 * Shopware DAL filter for the search endpoint.
 */
export interface ShopwareFilter {
  type: 'equals' | 'equalsAny' | 'contains' | 'range' | 'not' | 'multi'
  field?: string
  value?: unknown
  parameters?: Record<string, unknown>
  operator?: string
  queries?: ShopwareFilter[]
}

/**
 * Shopware DAL sort for the search endpoint.
 */
export interface ShopwareSort {
  field: string
  order?: 'ASC' | 'DESC'
  naturalSorting?: boolean
}

export class ShopwareClient {
  private http: AxiosInstance
  private baseApiUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('ShopwareClient: credentials.accessToken is required')
    }
    if (!rawBase) {
      throw new Error(
        'ShopwareClient: credentials.extra.baseUrl is required (e.g. https://myshop.example)',
      )
    }

    this.baseApiUrl = `${rawBase.replace(/\/$/, '')}/api`
    this.http = axios.create({
      baseURL: this.baseApiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Search an entity using Shopware's POST /search/{entity} endpoint.
   * Returns a flat list of entities with total count.
   */
  async search<T>(
    entity: string,
    options: {
      page?: number
      limit?: number
      filter?: ShopwareFilter[]
      sort?: ShopwareSort[]
      associations?: Record<string, Record<string, unknown>>
      includes?: Record<string, string[]>
    } = {},
  ): Promise<ShopwareListResult<T>> {
    const page = options.page ?? 1
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const body: Record<string, unknown> = {
      page,
      limit,
    }
    if (options.filter && options.filter.length > 0) body['filter'] = options.filter
    if (options.sort && options.sort.length > 0) body['sort'] = options.sort
    if (options.associations) body['associations'] = options.associations
    if (options.includes) body['includes'] = options.includes

    const raw = await this.post<{
      data?: T[]
      total?: number
      page?: number
      limit?: number
    }>(`search/${entity}`, body)

    return {
      data: raw.data ?? [],
      total: raw.total ?? 0,
      page: raw.page ?? page,
      limit: raw.limit ?? limit,
    }
  }

  /**
   * Get a single entity by ID. Shopware returns `{ data: {...} }`.
   */
  async getEntity<T>(entity: string, id: string): Promise<T> {
    const res = await this.get<{ data: T }>(`${entity}/${id}`)
    return res.data
  }

  /**
   * Create an entity. POST /{entity}. Returns created entity on
   * success (Shopware often returns 204 with no body on write operations,
   * so we do a follow-up GET).
   */
  async createEntity<T>(entity: string, body: Record<string, unknown>): Promise<T> {
    const id = body['id'] as string | undefined
    await this.post(`${entity}`, body)
    // Shopware returns 204 on create; fetch the created entity
    if (id) {
      return this.getEntity<T>(entity, id)
    }
    // If no id was provided (Shopware auto-generates), we can't GET it
    // directly. Return the body as-is.
    return body as unknown as T
  }

  /**
   * Update an entity. PATCH /{entity}/{id}. Returns updated entity.
   */
  async updateEntity<T>(
    entity: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    await this.patch(`${entity}/${id}`, body)
    return this.getEntity<T>(entity, id)
  }

  /**
   * Delete an entity. DELETE /{entity}/{id}.
   */
  async deleteEntity(entity: string, id: string): Promise<void> {
    await this.delete(`${entity}/${id}`)
  }
}
