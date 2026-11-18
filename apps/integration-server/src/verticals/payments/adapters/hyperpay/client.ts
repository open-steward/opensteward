/**
 * HyperPay (OPPWA) REST API client — thin axios wrapper.
 *
 * Auth: `Authorization: Bearer <accessToken>`. Request bodies are
 * `application/x-www-form-urlencoded`; responses are JSON. Every call is scoped
 * to the connect-time `entityId`, which the client injects automatically — as a
 * query param on GET and as a body field on POST — so callers never repeat it.
 *
 * The payments API is by-id only (no offset/cursor collection endpoints), so
 * there is no list/pagination helper here.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { getEntityId } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

/** Serialize a flat record to `application/x-www-form-urlencoded`, dropping nullish. */
function toForm(body: Record<string, unknown>): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined) continue
    out.append(k, String(v))
  }
  return out.toString()
}

export class HyperpayClient {
  private http: AxiosInstance
  private entityId: string

  constructor(credentials: Credentials, baseUrl: string = API_BASE_URL) {
    this.entityId = getEntityId(credentials)
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { entityId: this.entityId, ...params },
      })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const form = toForm({ entityId: this.entityId, ...(body ?? {}) })
      const { data } = await this.http.post<T>(path, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }
}
