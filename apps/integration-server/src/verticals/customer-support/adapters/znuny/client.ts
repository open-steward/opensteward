/**
 * Znuny REST HTTP client.
 *
 * All requests inject UserLogin + Password into query params (GET) or request
 * body (POST/PATCH). Znuny requires auth on every call when using per-request
 * credential mode (no sessions).
 *
 * Base URL is per-tenant: taken from credentials.extra.instanceUrl.
 * Path: /otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { WS_PATH } from './constants'

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

export class ZnunyClient {
  private http: AxiosInstance
  private authParams: { UserLogin: string; Password: string }

  constructor(credentials: Credentials) {
    const instanceUrl = (credentials.extra?.['instanceUrl'] as string | undefined)?.replace(/\/+$/, '')
    const userLogin = credentials.extra?.['userLogin'] as string | undefined
    const password = credentials.extra?.['password'] as string | undefined

    if (!instanceUrl) throw new Error('znuny client requires instanceUrl in credentials.extra')
    if (!userLogin) throw new Error('znuny client requires userLogin in credentials.extra')
    if (!password) throw new Error('znuny client requires password in credentials.extra')

    this.authParams = { UserLogin: userLogin, Password: password }

    this.http = axios.create({
      baseURL: `${instanceUrl}${WS_PATH}`,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * GET request — auth params appended to query string.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...this.authParams, ...params },
      })
      return data
    })
  }

  /**
   * POST request — auth params merged into JSON body.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, { ...this.authParams, ...body })
      return data
    })
  }
}
