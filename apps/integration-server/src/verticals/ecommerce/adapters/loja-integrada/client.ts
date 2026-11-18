/**
 * Loja Integrada REST API client.
 *
 * Host and auth come from Loja Integrada's OpenAPI specification
 * (https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json):
 *
 *  - `servers[0].url`: "https://api.awsli.com.br".
 *  - `info.description`, "Autenticação": "O acesso à API é feito enviando as
 *    credenciais no header `Authorization`, em uma de duas combinações fixas",
 *    one of which is "**`Basic` + Personal Token:** o Personal Token
 *    identifica o lojista — é único e exclusivo por loja.", shown as
 *    `--header 'Authorization: Basic N0Fxxxx…'`. The adapter uses that form:
 *    the connection's `accessToken` is the store's Personal Token.
 *
 * Lists answer in the `{ meta, objects }` envelope, e.g. GET /v1/categoria:
 * "**meta**: dados da paginação — `limit`, `offset`, `total_count` e os links
 * `next` e `previous` para navegação entre as páginas." and
 * `"next": "/api/v1/categoria?limit=20&offset=20"`, `"previous": null`.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { BASE_URL } from './constants'

/** The documented list envelope's `meta` block. */
export interface LojaIntegradaListMeta {
  limit?: number
  next?: string | null
  offset?: number
  previous?: string | null
  total_count?: number
}

/** One upstream page of a list. */
export interface LojaIntegradaPage<T> {
  items: T[]
  /** `meta.next` of the last request: a link when more rows follow, `null` on the last page. */
  next: string | null
  /** `meta.total_count`, when reported. */
  totalCount?: number
}

export class LojaIntegradaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error('Loja Integrada connection has no Personal Token (credentials.accessToken).')
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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
   * One page of a list: `limit` rows from 0-based row `offset`, the two query
   * parameters the documented `meta.next` links carry
   * (`/api/v1/produto?limit=20&offset=20`), plus the path's own documented
   * filters.
   *
   * Only GET /v1/pedido/search documents a maximum `limit`; the other lists
   * document none. A server that serves fewer rows than asked while
   * `meta.next` still names a following page has capped the page, so the rest
   * of the rows are fetched from where it stopped until `limit` rows are in
   * hand or `meta.next` is null. A short page is never passed on as a full
   * one, and the caller's page is never cut.
   *
   * Every documented list answer carries `meta.next` (a link, or null on the
   * last page). An answer that holds rows but no `meta.next` gives no end
   * signal, and reading it as the end would tell the sync the collection is
   * complete, so it throws. An answer with no rows and no `meta.next` is the
   * end.
   */
  async page<T>(
    path: string,
    offset: number,
    limit: number,
    filters: Record<string, unknown> = {},
  ): Promise<LojaIntegradaPage<T>> {
    const items: T[] = []
    let next: string | null = null
    let totalCount: number | undefined
    for (;;) {
      const body = await this.get<{ meta?: LojaIntegradaListMeta; objects?: T[] } | undefined>(
        path,
        { ...filters, limit: limit - items.length, offset: offset + items.length },
      )
      const meta = body?.meta
      const rows = Array.isArray(body?.objects) ? body.objects : []
      if (typeof meta?.next === 'string' || meta?.next === null) {
        next = meta.next
      } else if (rows.length === 0) {
        next = null
      } else {
        throw new Error(
          `Loja Integrada answered ${path} without meta.next, the documented end-of-list signal.`,
        )
      }
      items.push(...rows.slice(0, limit - items.length))
      if (typeof meta?.total_count === 'number') totalCount = meta.total_count
      if (next === null || items.length >= limit) break
      if (rows.length === 0) {
        throw new Error(
          `Loja Integrada answered ${path} with no rows at offset ${offset + items.length} ` +
            'while meta.next names a following page.',
        )
      }
    }
    return { items, next, ...(totalCount !== undefined ? { totalCount } : {}) }
  }
}
