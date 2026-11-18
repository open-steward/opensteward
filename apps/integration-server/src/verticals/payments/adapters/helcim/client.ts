/**
 * Helcim REST API client — thin axios wrapper.
 *
 * Auth is the `api-token` header (Helcim's own scheme, not OAuth Bearer).
 * Write endpoints under `/payment/*` additionally require a UUID
 * `idempotency-key` header, which callers pass via the `post` `idempotencyKey`
 * argument.
 *
 * Pagination is offset-style: list endpoints take `limit` (1–1000) + `page`
 * query params. List responses are a bare JSON array (no envelope), so the
 * client simply types `get<T[]>`.
 *
 * Docs: https://devdocs.helcim.com/docs/api-message-format
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { randomUUID } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class HelcimClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'api-token': credentials.accessToken ?? '',
        accept: 'application/json',
        'content-type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /**
   * POST a JSON body. `/payment/*` endpoints require a UUID `idempotency-key`
   * header; one is generated per call when not supplied so retries within the
   * same request don't double-charge.
   */
  async post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    return withRetry(async () => {
      const headers = { 'idempotency-key': idempotencyKey ?? randomUUID() }
      return (await this.http.post<T>(path, body, { headers })).data
    })
  }

  /**
   * PUT a JSON body. Used by update endpoints (e.g. `PUT /customers/{id}`,
   * `PUT /invoices/{id}`) which do not require an idempotency key.
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.put<T>(path, body)).data)
  }
}
