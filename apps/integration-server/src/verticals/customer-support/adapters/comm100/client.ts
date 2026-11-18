/**
 * Comm100 Server API v4 HTTP client.
 *
 * Base URL: https://api{n}.comm100.io/v4/ for Control Panel domain
 * dash{n}.comm100.io (https://developer.comm100.com/docs/server-api-introduction).
 * Auth: HTTP Basic, email as username and API key as password, with `siteId`
 * on every request (https://developer.comm100.com/docs/server-api-authentication).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

export interface Comm100Connection {
  baseURL: string
  email: string
  apiKey: string
  siteId: string
}

/**
 * The connection's host, login and site, or a reconnect error when any is
 * missing. exchangeCredentials admits only the documented domain numbers; a
 * connection saved by the old v3 password grant has no email or siteId and
 * lands here.
 */
export function comm100Connection(credentials: Credentials): Comm100Connection {
  const extra = credentials.extra ?? {}
  const n = String(extra['portalNumber'] ?? '').trim()
  const email = String(extra['email'] ?? '').trim()
  const siteId = String(extra['siteId'] ?? '').trim()
  const apiKey = credentials.accessToken ?? ''
  if (!n || !email || !siteId || !apiKey)
    throw Object.assign(
      new Error(
        'comm100 connection needs email, apiKey, siteId and portalNumber; reconnect with API-key credentials',
      ),
      { statusCode: 401, code: 'RECONNECT_REQUIRED' },
    )
  return { baseURL: API_BASE_URL_TEMPLATE.replace('{n}', n), email, apiKey, siteId }
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

export class Comm100Client {
  private http: AxiosInstance
  private siteId: string

  constructor(credentials: Credentials) {
    const conn = comm100Connection(credentials)
    this.siteId = conn.siteId
    this.http = axios.create({
      baseURL: conn.baseURL,
      auth: { username: conn.email, password: conn.apiKey },
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** GET a path relative to the v4 base (no leading slash), with `siteId` added. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...params, siteId: this.siteId },
      })
      return data
    })
  }
}
