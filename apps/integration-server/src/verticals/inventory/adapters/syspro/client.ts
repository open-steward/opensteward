/**
 * SYSPRO OData HTTP client.
 *
 * Base URL: {host}/SYSPRO8OData/SYSPROOData/{companyId}
 * Auth:     Authorization: Basic {base64(operator:password)}
 *
 * Pagination uses OData $top / $skip.
 * Responses are JSON with value: T[] for collection endpoints and a single T
 * for single-entity fetches.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

/** Shape returned by OData collection endpoints. */
export interface ODataCollection<T> {
  '@odata.context'?: string
  '@odata.count'?: number
  value: T[]
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

function buildBaseUrl(credentials: Credentials): string {
  const host      = String(credentials.extra?.['host'] ?? '').replace(/\/$/, '')
  const companyId = String(credentials.extra?.['companyId'] ?? '')
  if (!host || !companyId) {
    throw new Error('syspro client: host and companyId must be present in credentials.extra')
  }
  return `${host}/SYSPRO8OData/SYSPROOData/${companyId}`
}

export class SysproClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Fetch a single OData entity by path (e.g. `InvMaster('A100')`).
   * Returns the parsed JSON body directly (single-entity shape).
   */
  async getEntity<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * Fetch an OData collection endpoint.
   * Returns the `value` array from the OData response envelope.
   */
  async getCollection<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<ODataCollection<T>>(path, { params })
      return data.value ?? []
    })
  }
}
