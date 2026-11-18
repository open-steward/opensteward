import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type AuthNetEnvironment } from './constants'

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

export class AuthNetClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const env =
      ((credentials.extra as Record<string, unknown> | undefined)?.environment as AuthNetEnvironment) ??
      DEFAULT_ENVIRONMENT
    this.http = axios.create({
      baseURL: HOSTS[env],
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * Authorize.Net wraps every request in a single top-level operation key
   * (e.g. `createTransactionRequest`). The caller passes that key + the
   * body and gets the JSON response.
   */
  async call<T>(operation: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>('/xml/v1/request.api', { [operation]: body })
      return data
    })
  }
}
