import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { zohoDeskApiBase } from './constants'

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

/**
 * Desk API v1 client on the connection's data centre.
 *
 * "All Zoho Desk APIs require these two mandatory fields in the header.
 * Authorization - Authentication request token; orgId - ID of the
 * organization to access." The token goes as `Zoho-oauthtoken {token}`, one of
 * the two documented formats. https://desk.zoho.com/DeskAPIDocument
 */
export class ZohoDeskClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const dataCentre = credentials.extra?.['dataCentre']
    const orgId = credentials.extra?.['orgId']
    if (typeof dataCentre !== 'string' || !dataCentre) {
      throw new Error('zoho-desk requires credentials.extra.dataCentre; reconnect this connection')
    }
    if ((typeof orgId !== 'string' && typeof orgId !== 'number') || String(orgId) === '') {
      throw new Error('zoho-desk requires credentials.extra.orgId; reconnect this connection')
    }
    this.http = axios.create({
      baseURL: zohoDeskApiBase(dataCentre),
      headers: {
        Authorization: `Zoho-oauthtoken ${credentials.accessToken}`,
        orgId: String(orgId),
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET a path. A 204 ("No content", one of the documented status codes) has
   * an empty body, which comes back as `undefined` for the caller to read as
   * no rows.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T | undefined> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      if (res.status === 204) return undefined
      const data = res.data as unknown
      return data === '' || data == null ? undefined : (data as T)
    })
  }
}
