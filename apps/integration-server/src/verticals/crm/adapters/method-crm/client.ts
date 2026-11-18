import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * Thin HTTP client for the Method CRM REST API v1.
 *
 * Base URL : https://rest.method.me/api/v1
 * Auth     : Authorization: APIKey <api_key>
 *            The API key is stored in credentials.accessToken.
 *
 * All table endpoints follow the pattern:
 *   GET  /tables/{TableName}            — list with OData query params
 *   GET  /tables/{TableName}/{RecordId} — single record
 *   POST /tables/{TableName}            — create
 *   PATCH /tables/{TableName}/{RecordId} — update
 *   DELETE /tables/{TableName}/{RecordId} — delete
 *
 * List responses: { value: T[], count: number, nextLink?: string }
 */

export interface MethodListResponse<T> {
  value: T[]
  count: number
  nextLink?: string
}

export class MethodCrmClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `APIKey ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private url(path: string, params?: Record<string, string | number | undefined>): string {
    const u = new URL(`${BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          u.searchParams.set(k, String(v))
        }
      }
    }
    return u.toString()
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const res = await fetch(this.url(path, params), {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Method CRM API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Method CRM API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Method CRM API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async listTable<T>(
    tableName: string,
    top?: number,
    skip?: number,
    filter?: string,
  ): Promise<MethodListResponse<T>> {
    const params: Record<string, string | number | undefined> = {}
    if (top !== undefined) params['$top'] = top
    if (skip !== undefined) params['$skip'] = skip
    if (filter !== undefined) params['$filter'] = filter
    return this.get<MethodListResponse<T>>(`/tables/${tableName}`, params)
  }

  async getRecord<T>(tableName: string, recordId: string): Promise<T> {
    return this.get<T>(`/tables/${tableName}/${encodeURIComponent(recordId)}`)
  }

  async createRecord<T>(tableName: string, fields: Record<string, unknown>): Promise<T> {
    return this.post<T>(`/tables/${tableName}`, fields)
  }

  async updateRecord<T>(
    tableName: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<T> {
    return this.patch<T>(`/tables/${tableName}/${encodeURIComponent(recordId)}`, fields)
  }
}
