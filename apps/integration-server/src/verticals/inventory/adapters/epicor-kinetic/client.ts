/**
 * Epicor Kinetic REST v2 HTTP client.
 *
 * Base URL is tenant-specific and built from credentials.extra at runtime.
 * Every request requires both:
 *   Authorization: Bearer <access_token>
 *   x-api-key: <apiKey>
 *
 * Pagination uses OData $top / $skip parameters.
 * The response envelope for list calls is:
 *   { value: T[]; "@odata.count"?: number }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { epicorHostname, epicorPathSegment, normaliseEpicorHost } from './auth'
import { buildBaseUrl } from './constants'

/** OData list response envelope. */
export interface ODataListResponse<T> {
  value: T[]
  '@odata.count'?: number
}

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

export class EpicorKineticClient {
  private http: AxiosInstance
  private readonly host: string
  private hostCheck?: Promise<void>

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    // Re-validated here: the stored values decide where the token and API key go.
    this.host      = normaliseEpicorHost(extra['host'])
    const instance = epicorPathSegment(extra['instance'], 'Epicor instance', 'EpicorERP')
    const company  = epicorPathSegment(extra['company'], 'Epicor company code', 'EPIC06')
    const apiKey   = String(extra['apiKey']   ?? '')

    this.http = axios.create({
      baseURL: buildBaseUrl(this.host, instance, company),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-api-key':   apiKey,
        Accept:        'application/json',
      },
      timeout: 30_000,
    })
  }

  /** The host is customer-supplied: vet it once before the token and API key go to it. */
  private ensurePublicHost(): Promise<void> {
    return (this.hostCheck ??= assertPublicHost(epicorHostname(this.host)))
  }

  /** GET — returns raw parsed JSON. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /** GET a list with OData envelope, returning just the value array. */
  async list<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
    const res = await this.get<ODataListResponse<T>>(path, params)
    return res.value ?? []
  }
}
