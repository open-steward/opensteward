/**
 * Teamhood REST client.
 *
 * Auth: "All requests require an API key in the X-ApiKey header."
 * Base URL: https://api-{tenant}.teamhood.com/api/v1
 * (https://teamhood.com/knowledge-base/integrations/open-api/api-examples/)
 * Rate limit: "Note: Teamhood API is limited to 100 requests per minute"
 * (OpenAPI info.description) — back-off on 429 / 5xx.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH, API_HOST_TEMPLATE } from './constants'

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
 * The connection's tenant slug. Each company account has its own API
 * subdomain, so there is no default: a connection without one cannot be
 * served (it used to fall back to the public "demo" tenant).
 */
export function teamhoodTenant(credentials: Credentials): string {
  const tenant = credentials.extra?.['tenant']
  if (typeof tenant !== 'string' || tenant.trim() === '') {
    throw new Error('teamhood connection has no tenant; reconnect with your Teamhood tenant slug')
  }
  return tenant.trim()
}

function buildBaseUrl(tenant: string): string {
  return API_HOST_TEMPLATE.replace('{tenant}', tenant) + API_BASE_PATH
}

export class TeamhoodClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(teamhoodTenant(credentials)),
      headers: {
        'X-ApiKey': credentials.accessToken,
        Accept: 'application/json',
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
