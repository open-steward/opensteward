/**
 * PhonePe Standard Checkout V2 REST client.
 *
 * Auth is an `O-Bearer` access token (minted by the client-credentials
 * grant in `auth.ts`) attached to every Payment-Gateway request. The token
 * lives in `Credentials.accessToken`; the chosen environment in
 * `Credentials.extra.environment` selects the host.
 *
 * PhonePe's Standard Checkout surface is order-scoped: there is no
 * cursor/offset "list all" endpoint, so this client is a thin GET/POST
 * wrapper with retry on 429 / 5xx.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  AUTH_TOKEN_TYPE,
  DEFAULT_ENVIRONMENT,
  HOSTS,
  type PhonepeEnvironment,
} from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class PhonepeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const rawEnv = extra.environment as string | undefined
    const env: PhonepeEnvironment = rawEnv && rawEnv in HOSTS
      ? (rawEnv as PhonepeEnvironment)
      : DEFAULT_ENVIRONMENT
    this.http = axios.create({
      baseURL: HOSTS[env].pg,
      headers: {
        Authorization: `${AUTH_TOKEN_TYPE} ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
