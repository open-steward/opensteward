/**
 * Restaurant365 HTTP client.
 *
 * Two API surfaces:
 *   OData read API  — https://odata.restaurant365.net/api/v2/views/{Entity}
 *     Auth: Basic auth with Domain\Username (or bare bearer token for API partners)
 *     Pagination: $top / $skip
 *
 *   REST write API  — https://{tenant}.restaurant365.com/APIv1/{Endpoint}
 *     Auth: Authorization: Bearer {token}
 *     Used for AP Invoices / Journal Entries (write-only, not needed for inventory reads)
 *
 * For the inventory adapter (read path) we use the OData API exclusively.
 * The bearer token issued by R365 Support is sent as Authorization: Bearer.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { ODATA_BASE_URL } from './constants'

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

export class Restaurant365Client {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) throw new Error('restaurant365 requires credentials.accessToken (bearer token)')
    this.http = axios.create({
      baseURL: ODATA_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * OData GET — appends OData query params ($top, $skip, $filter, $select, $orderby).
   * Returns the raw parsed JSON.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
