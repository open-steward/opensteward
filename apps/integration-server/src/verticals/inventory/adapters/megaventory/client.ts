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
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Every Megaventory response carries this alongside its named array. */
export interface MegaventoryResponseStatus {
  ErrorCode?: string | number | null
  Message?: string | null
  Errors?: Array<{ ErrorCode?: string | null; Message?: string | null }> | null
}

export interface MegaventoryFilter {
  Group?: 'StartGroup' | 'EndGroup'
  AndOr?: 'And' | 'Or'
  FieldName: string
  SearchOperator: 'Equals' | 'NotEquals' | 'LessThan' | 'GreaterThan' | 'Contains'
  SearchValue: string | number
}

export interface MegaventoryRequest {
  Filters?: MegaventoryFilter[]
  ReturnTopNRecords?: number
  [key: string]: unknown
}

/**
 * Megaventory reports failure IN-BAND on an HTTP 200.
 *
 * A missing or invalid API key comes back as
 *   200 { "mvProducts": [], "ResponseStatus": { "ErrorCode": "500", ... } }
 * — verified live on 2026-09-18 against ProductGet with no key and with a
 * junk key. A client that only inspects the HTTP status sees a successful
 * empty list, so an unauthenticated sync completes and reports zero rows
 * instead of failing. `"0"` is the success code.
 */
export class MegaventoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
    message: string,
  ) {
    super(`Megaventory ${operation} failed (${code}): ${message}`)
    this.name = 'MegaventoryError'
  }
}

export class MegaventoryClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    // The key travels in the request body as `APIKEY`. Megaventory reads no
    // Authorization header at all — the previous client sent a Bearer token,
    // which the service ignored while answering 200 with an empty array.
    this.apiKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Call one operation and return its named array.
   *
   * `key` is the response field to read — it differs per operation and is not
   * derivable from the operation name.
   */
  async call<T>(operation: string, key: string, body: MegaventoryRequest = {}): Promise<T[]> {
    const payload = await withRetry(async () => {
      const { data } = await this.http.post<Record<string, unknown>>(`/${operation}`, {
        APIKEY: this.apiKey,
        ...body,
      })
      return data
    })

    this.assertOk(operation, payload)

    const rows = payload?.[key]
    return Array.isArray(rows) ? (rows as T[]) : []
  }

  /** Throw on an in-band error rather than letting it read as an empty result. */
  private assertOk(operation: string, payload: Record<string, unknown> | undefined): void {
    const status = payload?.['ResponseStatus'] as MegaventoryResponseStatus | undefined
    if (!status) return
    const code = status.ErrorCode == null ? '' : String(status.ErrorCode)
    // "0" is success. An absent code is treated as success because some
    // operations omit it entirely on a clean read.
    if (code === '' || code === '0') return
    const message =
      status.Message ?? status.Errors?.[0]?.Message ?? 'no message supplied by Megaventory'
    throw new MegaventoryError(operation, code, message)
  }
}
