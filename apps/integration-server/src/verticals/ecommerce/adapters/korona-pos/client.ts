/**
 * KORONA Cloud API v3 client.
 *
 * Auth: HTTP Basic (`securitySchemes.basicAuth` on every path in
 * https://128.koronacloud.com/web/api/v3/openapi.json).
 *
 * Every resource lives under
 * `/accounts/{koronaAccountId}/<resource>` (confirmed on every path in the
 * spec) — the base URL below includes the account id so callers pass only
 * the resource-relative path.
 *
 * Writes use `PATCH` for partial updates (not `PUT` — there is no `put`
 * method anywhere in the spec) and respond `204 No Content`, so every
 * mutating call in `index.ts` re-fetches with `GET` afterwards.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_VERSION } from './constants'

export interface KoronaResultList<T> {
  results: T[]
  currentPage: number
  pagesTotal: number
  resultsOfPage: number
  resultsTotal: number
}

/** `components.schemas.AddOrUpdateResult` — the response to every batched
 *  `POST` (add) and `POST /.../items` call, e.g. `POST /products`. */
export interface KoronaAddOrUpdateResult {
  status?: 'OK' | 'ERROR'
  action?: 'ADDED' | 'DELETED' | 'QUEUED' | 'UPDATED' | 'NONE'
  id?: string
  message?: string
}

export class KoronaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const host = credentials.extra?.['host'] as string | undefined
    const koronaAccountId = credentials.extra?.['koronaAccountId'] as string | undefined
    const username = (credentials.extra?.['username'] as string | undefined) ?? credentials.accessToken
    const password = credentials.extra?.['password'] as string | undefined

    if (!host) throw new Error('KoronaClient: credentials.extra.host is required')
    if (!koronaAccountId) {
      throw new Error('KoronaClient: credentials.extra.koronaAccountId is required')
    }
    if (!username || !password) {
      throw new Error('KoronaClient: credentials.extra.username and .password are required')
    }

    const basic = Buffer.from(`${username}:${password}`).toString('base64')
    this.http = axios.create({
      baseURL: `https://${host}/web/api/${API_VERSION}/accounts/${koronaAccountId}`,
      headers: {
        Authorization: `Basic ${basic}`,
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

  /** Page-based list helper for the uniform `{page, size}` → `ResultList*` envelope. */
  async list<T>(path: string, params: Record<string, unknown>): Promise<KoronaResultList<T>> {
    return this.get<KoronaResultList<T>>(path, params)
  }
}
