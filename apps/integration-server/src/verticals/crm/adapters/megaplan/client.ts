/**
 * Megaplan API v3 HTTP client.
 *
 * Docs: https://dev.megaplan.ru/apiv3/index.html
 *
 * Host: the connection's own account, `credentials.extra.baseUrl`
 * (e.g. https://acme.megaplan.ru), plus the documented prefix: "Все ресурсы
 * APIv3 доступны по URLs с префиксом /api/v3/". There is no shared host to
 * fall back to, so a connection without one is refused before any request.
 *
 * Auth: "AUTHORIZATION: Bearer MmMzNDc1NTQzN...".
 *
 * Query: a GET carries its parameters as ONE JSON document, not as form
 * fields: "Все параметры запроса отправляются в виде JSON в теле запросов, а
 * также в GET параметрах, например GET /api/v3/currency?{"limit": "3"}". The
 * first-party SDK (github.com/megaplan/megaplansdk, src/MegaplanRequest.php)
 * builds it as `'?'.rawurlencode(json_encode($params))`. A form-encoded query
 * (`?limit=3`) is rejected with 422 "Query string should be json".
 *
 * Envelope: `{ "meta": { "status", "errors", "pagination": { "count",
 * "limit" } }, "data": … }`.
 */

import type { Credentials } from '@opensteward/shared'
import { API_PREFIX } from './constants'

/** The documented list envelope. */
export interface MegaplanListResponse<T> {
  meta?: {
    status?: number
    errors?: unknown[]
    /**
     * "С пагинируемой коллекцией в metadata обязательно возвращается поле
     * pagination с полями: count — Общее количество сущностей по запросу;
     * limit — Лимит количества сущностей в ответе".
     */
    pagination?: {
      count?: number
      limit?: number
    }
  }
  data?: T[]
}

/** The documented single-entity envelope. */
export interface MegaplanSingleResponse<T> {
  meta?: { status?: number; errors?: unknown[] }
  data?: T
}

/** A query for GET: serialised as one JSON document. */
export type MegaplanQuery = Record<string, unknown>

export class MegaplanClient {
  private readonly token: string
  /** The account host, e.g. `https://acme.megaplan.ru`, with no trailing slash. */
  readonly baseUrl: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    const extra = credentials.extra as Record<string, unknown> | undefined
    const baseUrl = extra?.['baseUrl']
    if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
      throw Object.assign(
        new Error(
          'Megaplan connection has no account host (credentials.extra.baseUrl); reconnect with your account address, e.g. acme.megaplan.ru',
        ),
        { statusCode: 400, code: 'MISSING_CREDENTIAL' },
      )
    }
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '')
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private url(path: string, query?: MegaplanQuery): string {
    const base = `${this.baseUrl}${API_PREFIX}${path}`
    if (!query || Object.keys(query).length === 0) return base
    return `${base}?${encodeURIComponent(JSON.stringify(query))}`
  }

  private async request<T>(
    method: string,
    path: string,
    query?: MegaplanQuery,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(this.url(path, query), {
      method,
      headers: this.headers(),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Megaplan API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  async get<T>(path: string, query?: MegaplanQuery): Promise<T> {
    return this.request<T>('GET', path, query)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
