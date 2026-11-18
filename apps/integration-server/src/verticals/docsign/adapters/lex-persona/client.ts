import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'

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

/** The connection's tenant URL (`credentials.extra.baseUrl`), or undefined. */
export function tenantBaseUrl(credentials: Credentials): string | undefined {
  const raw = credentials.extra?.['baseUrl']
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

/**
 * Goodflag Signature Workflow Manager client. Paths are absolute from the
 * tenant origin (`/api/workflows`, …), and every request carries
 * `Authorization: Bearer <token>`
 * (https://docs.goodflag.com/wm/api-reference/authentification.md).
 */
export class LexPersonaClient {
  private http: AxiosInstance
  private readonly baseUrl: string | undefined

  constructor(credentials: Credentials) {
    this.baseUrl = tenantBaseUrl(credentials)
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** The API has no shared host: without the tenant URL there is nowhere to send a request. */
  private requireBaseUrl(): void {
    if (!this.baseUrl) {
      throw Object.assign(
        new Error(
          'lex-persona connection has no Workflow Manager URL (credentials.extra.baseUrl); reconnect with the tenant URL',
        ),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    this.requireBaseUrl()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    this.requireBaseUrl()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
