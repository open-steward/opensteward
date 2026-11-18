/**
 * eSignly REST API client.
 *
 * Auth: a static `api_key` submitted as a request parameter on every call —
 * as a query-string param on GETs and as a `multipart/form-data` field on
 * POSTs (matching the documented `createSignRequest` example). JSON is
 * returned. Lists are page + page_size paginated.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_KEY_PARAM } from './constants'

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

export class EsignlyClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = String(credentials.accessToken ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** GET — the API key rides along as a query-string parameter. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { [API_KEY_PARAM]: this.apiKey, ...(params ?? {}) },
      })
      return data
    })
  }

  /**
   * POST — the documented transport for every eSignly v1 RPC. The API
   * reference (https://www.esignly.com/api-docs.html → the collection
   * https://www.esignly.com/eSignlyDec16-postmanCollection.json) sends each
   * call as `"method": "POST"` with `"body": { "mode": "formdata", ... }` and
   * `api_key` as the first form field, so the body is multipart/form-data.
   *
   * eSignly reports failures inside a 200 body, e.g. the documented
   * `{ "status_code": 420, "has_error": true, "error_details": "Invalid
   * Request Key" }`. Such a body is thrown, never parsed as data.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const form = new FormData()
      form.append(API_KEY_PARAM, this.apiKey)
      for (const [k, v] of Object.entries(body ?? {})) {
        if (v === undefined || v === null) continue
        form.append(k, String(v))
      }
      const { data } = await this.http.post<T>(path, form)
      const envelope = data as {
        has_error?: unknown
        status_code?: unknown
        error_details?: unknown
      }
      if (envelope && typeof envelope === 'object' && envelope.has_error === true) {
        throw Object.assign(
          new Error(
            `eSignly ${path} failed (status_code ${String(envelope.status_code)}): ${String(envelope.error_details ?? '')}`,
          ),
          { statusCode: 502, code: 'UPSTREAM_ERROR', upstreamStatusCode: envelope.status_code },
        )
      }
      return data
    })
  }
}
