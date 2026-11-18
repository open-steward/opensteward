/**
 * Frappe CRM HTTP client.
 *
 * Auth: Frappe token-based auth — `Authorization: token <api_key>:<api_secret>`.
 * The instance base URL is self-hosted and stored in credentials.extra.instanceUrl.
 *
 * Pagination: offset-based via `limit_start` + `limit_page_length`.
 * List responses have shape: `{ data: T[] }`.
 * Single-document responses: `{ data: T }`.
 */

import type { Credentials } from '@opensteward/shared'
import { RESOURCE_PREFIX } from './constants'

interface FrappeListResponse<T> {
  data: T[]
}

interface FrappeSingleResponse<T> {
  data: T
}

function instanceUrl(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, string> | undefined
  const base = (extra?.['instanceUrl'] ?? '').replace(/\/$/, '')
  if (!base) throw new Error('FrappeCRM: credentials.extra.instanceUrl is required')
  return base
}

function authHeader(credentials: Credentials): string {
  // accessToken = api_key, refreshToken = api_secret
  const key = credentials.accessToken
  const secret = credentials.refreshToken ?? ''
  if (!secret) return `token ${key}`
  return `token ${key}:${secret}`
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(credentials),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Frappe CRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class FrappeCrmClient {
  constructor(private credentials: Credentials) {}

  private url(doctype: string, name?: string): string {
    const base = instanceUrl(this.credentials)
    if (name) {
      return `${base}${RESOURCE_PREFIX}/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
    }
    return `${base}${RESOURCE_PREFIX}/${encodeURIComponent(doctype)}`
  }

  async list<T>(
    doctype: string,
    params: {
      fields?: string
      filters?: string
      limit?: number
      offset?: number
      orderBy?: string
    } = {},
  ): Promise<T[]> {
    const url = new URL(this.url(doctype))
    if (params.fields) {
      url.searchParams.set(
        'fields',
        `["${params.fields.split(',').join('","')}"]`,
      )
    }
    if (params.filters) url.searchParams.set('filters', params.filters)
    if (params.limit != null) url.searchParams.set('limit_page_length', String(params.limit))
    if (params.offset != null) url.searchParams.set('limit_start', String(params.offset))
    if (params.orderBy) url.searchParams.set('order_by', params.orderBy)

    const res = await request<FrappeListResponse<T>>(
      'GET',
      url.toString(),
      this.credentials,
    )
    return res.data ?? []
  }

  async get<T>(doctype: string, name: string): Promise<T> {
    const res = await request<FrappeSingleResponse<T>>(
      'GET',
      this.url(doctype, name),
      this.credentials,
    )
    return res.data
  }

  async post<T>(doctype: string, body: unknown): Promise<T> {
    const res = await request<FrappeSingleResponse<T>>(
      'POST',
      this.url(doctype),
      this.credentials,
      body,
    )
    return res.data
  }

  async put<T>(doctype: string, name: string, body: unknown): Promise<T> {
    const res = await request<FrappeSingleResponse<T>>(
      'PUT',
      this.url(doctype, name),
      this.credentials,
      body,
    )
    return res.data
  }

  async delete(doctype: string, name: string): Promise<void> {
    await request<unknown>(
      'DELETE',
      this.url(doctype, name),
      this.credentials,
    )
  }
}
