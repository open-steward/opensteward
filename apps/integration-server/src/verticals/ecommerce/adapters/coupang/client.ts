/**
 * Coupang WING API HTTP client with an HMAC-SHA256 request-signing interceptor.
 *
 * Every request is signed with a custom Authorization header over the
 * signed-date, the HTTP method, the path and the query string as sent (see
 * `auth.ts`). No OAuth flow: credentials are permanent API keys from WING.
 */

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildAuthorizationHeader, serializeQuery } from './auth'
import { BASE_URL } from './constants'

// ── Lossless JSON ────────────────────────────────────────────────────────────

/**
 * Parse a Coupang response body, keeping integers that do not fit a double as
 * their decimal string.
 *
 * `shipmentBoxId` is documented as a number, and the first-party example is
 * 642538970006401429 (https://developers.coupang.com/en/api/shipments/single-po-query-using-shipmentboxid),
 * which is past Number.MAX_SAFE_INTEGER: a plain JSON.parse rounds it to a
 * different id, and a get by that id then reads another shipment or none.
 * The reviver's `context.source` (Node 21+) holds the literal text.
 */
export function parseCoupangJson(text: string): unknown {
  return JSON.parse(text, function (
    this: unknown,
    _key,
    value: unknown,
    context?: { source?: string },
  ) {
    if (
      typeof value === 'number' &&
      !Number.isSafeInteger(value) &&
      context?.source !== undefined &&
      /^-?\d+$/.test(context.source)
    ) {
      return context.source
    }
    return value
  } as (this: unknown, key: string, value: unknown) => unknown)
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string' || data.trim() === '') return data
  try {
    return parseCoupangJson(data)
  } catch {
    return data
  }
}

// ── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// ── Client ───────────────────────────────────────────────────────────────────

export class CoupangClient {
  private http: AxiosInstance
  private accessKey: string
  private secretKey: string

  constructor(credentials: Credentials) {
    const accessKey = credentials.accessToken
    const secretKey = credentials.extra?.['secretKey'] as string | undefined
    const vendorId = credentials.extra?.['vendorId'] as string | undefined

    if (!accessKey) {
      throw new Error('CoupangClient requires credentials.accessToken (the Coupang access key).')
    }
    if (!secretKey) {
      throw new Error(
        'CoupangClient requires credentials.extra.secretKey (the Coupang vendor secret key).',
      )
    }
    if (!vendorId) {
      throw new Error('CoupangClient requires credentials.extra.vendorId (the Coupang vendor ID).')
    }

    this.accessKey = accessKey
    this.secretKey = secretKey

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Accept: 'application/json',
      },
      timeout: 30_000,
      // The query string is serialised here and in the signer by the same
      // function, so the signed string is the sent one.
      paramsSerializer: {
        serialize: (params) => serializeQuery(params as Record<string, unknown>),
      },
      transformResponse: [parseBody],
    })

    // ── HMAC-SHA256 request-signing interceptor ───────────────────────────────
    this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const method = (config.method ?? 'GET').toUpperCase()
      const path = config.url ?? '/'
      const query = serializeQuery(config.params as Record<string, unknown> | undefined)
      config.headers['Authorization'] = buildAuthorizationHeader(
        this.accessKey,
        this.secretKey,
        method,
        path,
        query,
      )
      return config
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { params })
      return data
    })
  }

  async put<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, { params })
      return data
    })
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }
}
