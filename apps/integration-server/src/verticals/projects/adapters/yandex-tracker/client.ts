import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/** A response body with its headers, keys lower-cased. */
export interface UpstreamResponse<T> {
  data: T
  headers: Record<string, string>
}

function headerMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === undefined || v === null) continue
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

/**
 * Yandex Tracker REST client.
 *
 * Auth: `Authorization: OAuth <token>` header.
 * Org context: `X-Cloud-Org-Id` header (Yandex Cloud orgs) or
 *              `X-Org-ID` header (Yandex 360 for Business orgs).
 * The orgId is passed as a constructor arg and forwarded on every request.
 */
export class YandexTrackerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, orgId?: string) {
    const orgHeaders: Record<string, string> = {}
    if (orgId) {
      // Yandex Cloud org IDs start with 'b1g' or 'bpf'; 360 orgs are numeric.
      if (/^\d+$/.test(orgId)) {
        orgHeaders['X-Org-ID'] = orgId
      } else {
        orgHeaders['X-Cloud-Org-Id'] = orgId
      }
    }

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `OAuth ${credentials.accessToken}`,
        Accept: 'application/json',
        ...orgHeaders,
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

  /** GET that also returns the response headers (X-Total-Pages, Link). */
  async getPage<T>(path: string, params?: Record<string, unknown>): Promise<UpstreamResponse<T>> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      return { data: res.data, headers: headerMap(res.headers) }
    })
  }

  /** POST with query parameters that also returns the response headers. */
  async postPage<T>(
    path: string,
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<UpstreamResponse<T>> {
    return withRetry(async () => {
      const res = await this.http.post<T>(path, body, {
        params,
        headers: { 'Content-Type': 'application/json' },
      })
      return { data: res.data, headers: headerMap(res.headers) }
    })
  }
}
