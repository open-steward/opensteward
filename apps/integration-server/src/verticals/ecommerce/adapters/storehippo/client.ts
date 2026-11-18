/**
 * StoreHippo REST API client.
 *
 * From the API overview (https://help.storehippo.com/api):
 *  - "https://{storename}.storehippo.com/api/1.1/entity/ms.products" ("How to call");
 *  - "Authenticate your API requests by passing your access key in the
 *    access-key header of your HTTP request.";
 *  - a success response carries `messages`, `data` ("It contains the response
 *    body.") and, for list APIs, `paging` ("Paging is returned with list API.
 *    It contains the paging detail like start, limit, count, total etc");
 *  - list requests take `limit` ("Default Value : 50") and `start` ("A limit
 *    on the number of records to be skipped before returning."), plus
 *    `filters` and `sort` in the query string.
 *
 * Retries with exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION } from './constants'

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

/** The documented `paging` object: `{ "limit": 50, "start": 0, "count": 50, "total": 50 }`. */
export interface StoreHippoPaging {
  limit?: number
  start?: number
  count?: number
  total?: number
}

export interface StoreHippoListEnvelope<T> {
  data?: T[]
  paging?: StoreHippoPaging
}

export interface StoreHippoItemEnvelope<T> {
  data: T
}

/** One documented filter: "Every filter in the filters array has field, operator(optional) and value fields." */
export interface StoreHippoFilter {
  field: string
  operator?: 'equal' | 'not_equal' | 'less_than' | 'greater_than' | 'in'
  value: unknown
}

/** The documented list query: `start`, `limit`, and optionally `filters`. */
export interface StoreHippoListQuery {
  start: number
  limit: number
  filters?: StoreHippoFilter[]
}

export interface StoreHippoListPage<T> {
  rows: T[]
  paging?: StoreHippoPaging
}

export class StoreHippoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accessKey = credentials.accessToken
    const storename = credentials.extra?.['storename'] as string | undefined

    if (!storename) {
      throw new Error(
        'StoreHippoClient: credentials.extra.storename is required ' +
          '(the subdomain of your StoreHippo store, e.g. "mystore" for mystore.storehippo.com)',
      )
    }
    if (!accessKey) {
      throw new Error('StoreHippoClient: credentials.accessToken (API access key) is required')
    }

    const baseURL = `https://${storename}.storehippo.com/api/${API_VERSION}`
    this.http = axios.create({
      baseURL,
      headers: {
        'access-key': accessKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET /entity/{entityName}?start=&limit=[&filters=]
   *
   * Sends exactly the caller's `start` and `limit`. `filters` goes on the
   * query string as the JSON array the overview's "Filtering" section
   * describes.
   */
  async list<T>(entityName: string, query: StoreHippoListQuery): Promise<StoreHippoListPage<T>> {
    return withRetry(async () => {
      const params: Record<string, unknown> = { start: query.start, limit: query.limit }
      if (query.filters) params['filters'] = JSON.stringify(query.filters)
      const { data } = await this.http.get<StoreHippoListEnvelope<T>>(`/entity/${entityName}`, {
        params,
      })
      return { rows: Array.isArray(data.data) ? data.data : [], paging: data.paging }
    })
  }

  /** GET /entity/{entityName}/{id}: the reference's `get` command. */
  async get<T>(entityName: string, id: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<StoreHippoItemEnvelope<T>>(
        `/entity/${entityName}/${encodeURIComponent(id)}`,
      )
      return data.data
    })
  }

  /** POST /entity/{entityName}: create a record. */
  async post<T>(entityName: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<StoreHippoItemEnvelope<T>>(`/entity/${entityName}`, {
        data: body,
      })
      return data.data
    })
  }

  /** PUT /entity/{entityName}/{id}: update a record. */
  async put<T>(entityName: string, id: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<StoreHippoItemEnvelope<T>>(
        `/entity/${entityName}/${id}`,
        { data: body },
      )
      return data.data
    })
  }

  /** DELETE /entity/{entityName}/{id}: delete a record. */
  async delete(entityName: string, id: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`/entity/${entityName}/${id}`)
    })
  }
}
