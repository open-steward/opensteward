/**
 * SigniFlow REST API client.
 *
 * Auth: token obtained via POST /Login is embedded in the JSON body of every
 * request as `TokenField: { TokenField: "...", TokenExpiryField: "..." }`.
 * There is no Authorization header. The SignFlowAPIServiceRest.svc service is
 * POST-JSON throughout — list, fetch and mutation operations are all POSTs
 * whose JSON body carries the parameters (document id, workflow id) plus the
 * embedded token. Responses are JSON.
 *
 * The deployment host comes from `credentials.extra.host` (collected on the
 * Connect Link form) and falls back to the public-cloud host.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_SERVICE_PATH, DEFAULT_HOST } from './constants'

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

/** The token object embedded in every SigniFlow request body. */
interface TokenObject {
  TokenField: string
  TokenExpiryField: string
}

export class SigniFlowClient {
  private http: AxiosInstance
  private tokenObject: TokenObject

  constructor(credentials: Credentials) {
    const host = String(credentials.extra?.['host'] ?? DEFAULT_HOST).replace(/\/+$/, '')
    const tokenStr = typeof credentials.accessToken === 'string' ? credentials.accessToken : ''
    const tokenExpiry = String(credentials.extra?.['tokenExpiry'] ?? '')
    this.tokenObject = { TokenField: tokenStr, TokenExpiryField: tokenExpiry }
    this.http = axios.create({
      baseURL: `${host}${API_SERVICE_PATH}`,
      headers: {
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * SigniFlow's REST surface is POST-JSON throughout. `post` covers reads,
   * fetches and mutations alike; the operation is in the path, the parameters
   * in the body. The token is merged into every request body automatically.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const payload = { ...(body ?? {}), TokenField: this.tokenObject }
      const { data } = await this.http.post<T>(path, payload, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
