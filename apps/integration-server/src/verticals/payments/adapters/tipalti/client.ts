/**
 * Tipalti REST API client — thin axios wrapper.
 *
 * Auth: `Authorization: Bearer <access-token>` (OAuth2 client-credentials,
 * see auth.ts). The base URL is selected per environment off the
 * credentials' stored `environment`.
 *
 * Lists are cursor-paginated: pass `page-size` (and `page-cursor` from the
 * previous response's `pageInfo.nextPageCursor`); the envelope carries
 * `{ totalCount, pageInfo: { hasNextPage, nextPageCursor }, items }`.
 *
 * Docs: https://documentation.tipalti.com/reference/pagination-1
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiBaseUrl, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { environmentOf } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Cursor-paginated list envelope returned by Tipalti collection endpoints. */
export interface TipaltiPage<T> {
  totalCount?: number
  pageInfo?: {
    hasNextPage?: boolean
    nextPageCursor?: string | null
  }
  items?: T[]
}

export interface TipaltiListParams {
  /** 1..200 — Tipalti rejects larger page sizes with a 400. */
  pageSize?: number
  pageCursor?: string
  /** Tipalti filter query string (see Filtering docs). */
  filter?: string
}

export class TipaltiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: apiBaseUrl(environmentOf(credentials)),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /** GET a cursor-paginated collection, mapping canonical params onto the wire. */
  async list<T>(path: string, params?: TipaltiListParams): Promise<TipaltiPage<T>> {
    const size = Math.min(params?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = { 'page-size': size }
    if (params?.pageCursor) query['page-cursor'] = params.pageCursor
    if (params?.filter) query['filter'] = params.filter
    return this.get<TipaltiPage<T>>(path, query)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.patch<T>(path, body)).data)
  }
}
