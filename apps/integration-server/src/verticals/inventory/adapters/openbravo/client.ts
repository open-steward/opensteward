/**
 * HTTP client for the Openbravo JSON REST Web Services.
 *
 * Endpoint pattern: {host}/openbravo/org.openbravo.service.json.jsonrest/{Entity}
 * Auth: HTTP Basic (Authorization: Basic base64(username:password))
 * Pagination: _startRow (0-based, inclusive) / _endRow (exclusive)
 *
 * The Openbravo JSON service wraps every response in:
 *   { response: { status: 0, startRow: N, endRow: N, totalRows: N, data: [...] } }
 * A status != 0 signals an error.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { JSON_REST_PATH } from './constants'

export interface ObJsonResponse<T> {
  response: {
    status: number
    startRow?: number
    endRow?: number
    totalRows?: number
    data?: T[]
    error?: { message?: string }
  }
}

export interface ObSingleResponse<T> {
  response: {
    status: number
    data?: T[]
    error?: { message?: string }
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class OpenbravoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const host = String(credentials.extra?.['host'] ?? '').replace(/\/$/, '')
    const username = String(credentials.extra?.['username'] ?? '')
    const password = credentials.accessToken
    if (!host || !username || !password) {
      throw new Error(
        'openbravo requires credentials.extra.host + extra.username + accessToken (password)',
      )
    }
    const token = Buffer.from(`${username}:${password}`).toString('base64')
    this.http = axios.create({
      baseURL: `${host}${JSON_REST_PATH}`,
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Fetch a list page from the given entity.
   * Returns the raw `response` envelope so callers can read totalRows.
   */
  async list<T>(
    entity: string,
    params: Record<string, unknown>,
  ): Promise<ObJsonResponse<T>['response']> {
    return withRetry(async () => {
      const { data } = await this.http.get<ObJsonResponse<T>>(`/${entity}`, { params })
      if (data.response.status !== 0) {
        throw new Error(
          `openbravo ${entity} error: ${data.response.error?.message ?? JSON.stringify(data.response)}`,
        )
      }
      return data.response
    })
  }

  /**
   * Fetch a single record by ID.
   */
  async getById<T>(entity: string, id: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<ObSingleResponse<T>>(`/${entity}/${id}`)
      if (data.response.status !== 0) {
        throw new Error(
          `openbravo ${entity}/${id} error: ${data.response.error?.message ?? JSON.stringify(data.response)}`,
        )
      }
      const record = data.response.data?.[0]
      if (!record) throw new Error(`openbravo ${entity} id=${id} not found`)
      return record
    })
  }
}
