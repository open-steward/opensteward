/**
 * Sylius Admin API client.
 *
 * Sylius's Admin API (v2, API Platform) uses standard REST+JSON:
 *
 *   GET  /api/v2/admin/products     -> { "hydra:member": [...], "hydra:totalItems": N }
 *   GET  /api/v2/admin/products/:code -> { "@id": "/api/v2/admin/products/MUG", ... }
 *
 * This is a JSON-LD / Hydra format. List endpoints return paginated
 * collections with `hydra:member` arrays. Single-resource endpoints
 * return the resource directly.
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

export interface SyliusListResult<T> {
  items: T[]
  totalCount: number
  currentPage: number
  pageSize: number
}

export class SyliusClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('SyliusClient: credentials.accessToken is required')
    }
    if (!rawBase) {
      throw new Error(
        'SyliusClient: credentials.extra.baseUrl is required (e.g. https://my-sylius.example)',
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
      return data as T
    })
  }

  async post<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post(path, body)
      return data as T
    })
  }

  async patch<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch(path, body, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      })
      return data as T
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * List helper for Sylius's Hydra-based paginated responses.
   *
   *   GET /api/v2/admin/products?page=1&itemsPerPage=30
   *   -> { "hydra:member": [...], "hydra:totalItems": 42 }
   */
  async list<T = Record<string, unknown>>(
    path: string,
    options: {
      page?: number
      perPage?: number
      filter?: Record<string, string | number>
    } = {},
  ): Promise<SyliusListResult<T>> {
    const page = options.page ?? 1
    const perPage = Math.min(options.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      page,
      itemsPerPage: perPage,
    }
    // Sylius filtering: query params like ?product=code or ?order=id
    if (options.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        params[key] = value
      }
    }

    const raw = await withRetry(async () => {
      const { data } = await this.http.get(path, { params })
      return data as {
        'hydra:member'?: T[]
        'hydra:totalItems'?: number
      }
    })

    const items = raw['hydra:member'] ?? []
    return {
      items,
      totalCount: raw['hydra:totalItems'] ?? items.length,
      currentPage: page,
      pageSize: perPage,
    }
  }
}
