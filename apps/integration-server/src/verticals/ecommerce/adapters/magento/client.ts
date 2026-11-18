/**
 * Magento / Adobe Commerce REST API client.
 *
 * Features:
 *  - Bearer auth header from an admin integration token
 *    (`Authorization: Bearer {token}`).
 *  - Retries with exponential backoff on 429 and 5xx — mirrors the
 *    Shopify / WooCommerce clients in structure so adapter code stays
 *    structurally consistent across platforms.
 *  - `listWithSearchCriteria` helper that wraps Magento's idiosyncratic
 *    `searchCriteria[...]` query param syntax and reads the shared
 *    `{ items, total_count, search_criteria }` response envelope.
 *
 * No automatic 401→refresh retry: Magento's refresh is "re-call the
 * admin token endpoint with stored username/password", which requires
 * feeding the refreshed `Credentials` back through the adapter, so
 * callers invoke `refreshCredentials` explicitly.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

export interface MagentoListResult<T> {
  items: T[]
  totalCount: number
  currentPage: number
  pageSize: number
}

/**
 * Magento search-criteria filter — one condition against one field.
 * Example:
 *
 *   { field: 'sku', value: 'SKU-1', conditionType: 'eq' }
 */
export interface SearchCriteriaFilter {
  field: string
  value: string | number
  conditionType?: string
}

/**
 * A `filter_groups[N]` entry — filters within the same group are ORed,
 * filters across groups are ANDed. For common single-field lookups
 * callers pass one filter per group.
 */
export interface SearchCriteriaFilterGroup {
  filters: SearchCriteriaFilter[]
}

function buildSearchCriteriaParams(
  currentPage: number,
  pageSize: number,
  filterGroups: SearchCriteriaFilterGroup[] = [],
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    'searchCriteria[currentPage]': currentPage,
    'searchCriteria[pageSize]': pageSize,
  }
  filterGroups.forEach((group, gi) => {
    group.filters.forEach((f, fi) => {
      const prefix = `searchCriteria[filter_groups][${gi}][filters][${fi}]`
      params[`${prefix}[field]`] = f.field
      params[`${prefix}[value]`] = f.value
      if (f.conditionType) {
        params[`${prefix}[condition_type]`] = f.conditionType
      }
    })
  })
  return params
}

export class MagentoClient {
  private http: AxiosInstance
  private baseUrl: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    const rawBase = credentials.extra?.['baseUrl'] as string | undefined

    if (!token) {
      throw new Error('MagentoClient: credentials.accessToken is required')
    }
    if (!rawBase) {
      throw new Error(
        'MagentoClient: credentials.extra.baseUrl is required (e.g. https://mystore.example)',
      )
    }

    this.baseUrl = `${rawBase.replace(/\/$/, '')}/rest/${API_VERSION}`
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

  async put<T>(path: string, body?: unknown): Promise<T> {
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

  /**
   * List helper that wraps Magento's `searchCriteria[...]` query param
   * syntax and the shared `{ items, total_count, search_criteria }`
   * response envelope.
   *
   * `filterGroups` is an array of filter groups — filters inside a group
   * are ORed, groups are ANDed.
   */
  async listWithSearchCriteria<T>(
    path: string,
    options: {
      currentPage?: number
      pageSize?: number
      filterGroups?: SearchCriteriaFilterGroup[]
    } = {},
  ): Promise<MagentoListResult<T>> {
    const currentPage = options.currentPage ?? 1
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const params = buildSearchCriteriaParams(
      currentPage,
      pageSize,
      options.filterGroups ?? [],
    )

    const raw = await this.get<{
      items?: T[]
      total_count?: number
      search_criteria?: { current_page?: number; page_size?: number }
    }>(path, params)

    return {
      items: raw.items ?? [],
      totalCount: raw.total_count ?? 0,
      currentPage: raw.search_criteria?.current_page ?? currentPage,
      pageSize: raw.search_criteria?.page_size ?? pageSize,
    }
  }
}
