import axios, { type AxiosInstance } from 'axios'
import { SMC3_CCXL_API_BASE, SMC3_RWXL_API_BASE, SMC3_CCXL_API_VERSION } from './constants'
import { parseCredentials } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * SMC3 CarrierConnect XL (CCXL) REST client.
 *
 * All requests use POST with JSON bodies. Authentication is via three HTTP
 * headers: licenseKey, username, password (plus optional apiVersion).
 */
export class Smc3CcxlClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const { username, password, licenseKey } = parseCredentials(credentials.accessToken)
    this.http = axios.create({
      baseURL: SMC3_CCXL_API_BASE,
      headers: {
        licenseKey,
        username,
        password,
        apiVersion: SMC3_CCXL_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}

/**
 * SMC3 RateWare XL (RWXL) REST client.
 *
 * Same header-based auth as CCXL, different base URL.
 */
export class Smc3RwxlClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const { username, password, licenseKey } = parseCredentials(credentials.accessToken)
    this.http = axios.create({
      baseURL: SMC3_RWXL_API_BASE,
      headers: {
        licenseKey,
        username,
        password,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
