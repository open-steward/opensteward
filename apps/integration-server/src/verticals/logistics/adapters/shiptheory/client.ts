import axios, { type AxiosInstance } from 'axios'
import { SHIPTHEORY_API_BASE } from './constants'
import { authHeader, parseEmailPassword } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export interface ShiptheoryTokenResponse {
  data: {
    token: string
  }
}

export class ShiptheoryClient {
  private http: AxiosInstance
  private bearerToken: string

  constructor(credentials: Credentials) {
    this.bearerToken = credentials.accessToken
    this.http = axios.create({
      baseURL: SHIPTHEORY_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Authenticate with Shiptheory using email + password and store the JWT.
   * The credentials.refreshToken should be "email:password".
   */
  async authenticate(credentials: Credentials): Promise<string> {
    const { email, password } = parseEmailPassword(credentials.refreshToken ?? '')
    const { data } = await this.http.post<ShiptheoryTokenResponse>('/token', {
      email,
      password,
    })
    this.bearerToken = data.data.token
    return this.bearerToken
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: authHeader(this.bearerToken),
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: this.authHeaders(),
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: this.authHeaders(),
      })
      return data
    })
  }
}

/**
 * Build a fully-authenticated client. If the stored accessToken is blank,
 * obtain a fresh JWT from Shiptheory first.
 */
export async function buildClient(credentials: Credentials): Promise<ShiptheoryClient> {
  const client = new ShiptheoryClient(credentials)
  if (!credentials.accessToken) {
    await client.authenticate(credentials)
  }
  return client
}
