/**
 * Global Payments GP-API client: a thin axios wrapper.
 *
 * Every GP-API operation requires two headers (see constants.ts):
 *   - `Authorization`: "Bearer access token value used to authorize and
 *     access the API. Must always begin with the string \"Bearer\"."
 *   - `X-GP-Version`: "The version of the API to execute the request."
 *
 * The bearer token comes from POST /accesstoken (auth.ts). It expires, so the
 * client mints a new one when it is missing or past `expiresAt`, and once more
 * on a 401.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, GP_API_VERSION } from './constants'
import { mintToken, readExtra } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
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

export class GlobalPaymentsClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Accept: 'application/json',
        'X-GP-Version': GP_API_VERSION,
      },
      timeout: 30_000,
    })
  }

  private async ensureToken(): Promise<string> {
    const expiresAt = this.credentials.expiresAt
    const expired =
      !this.credentials.accessToken ||
      (expiresAt !== undefined && new Date(expiresAt).getTime() <= Date.now())
    if (expired) this.credentials = await mintToken(readExtra(this.credentials))
    return this.credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const token = await this.ensureToken()
      try {
        const { data } = await this.http.get<T>(path, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        })
        return data
      } catch (err) {
        if ((err as AxiosError).response?.status !== 401) throw err
        this.credentials = await mintToken(readExtra(this.credentials))
        const { data } = await this.http.get<T>(path, {
          params,
          headers: { Authorization: `Bearer ${this.credentials.accessToken}` },
        })
        return data
      }
    })
  }
}
