import axios, { type AxiosInstance } from 'axios'
import { COLPPY_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** JSON-RPC style client for Colppy API */
export class ColppyClient {
  private http: AxiosInstance
  private sessionToken: string

  constructor(credentials: Credentials) {
    this.sessionToken = credentials.accessToken
    this.http = axios.create({
      baseURL: COLPPY_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** Send a JSON-RPC style request to the Colppy API */
  async call<T>(service: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<{ response: T; success: boolean; error?: string }>(
        '',
        {
          auth: { token: this.sessionToken },
          service,
          method,
          parameters: params,
        },
      )
      if (data.error) {
        throw new Error(`Colppy API error: ${data.error}`)
      }
      return data.response
    })
  }

  async get<T>(service: string, method: string, params?: Record<string, unknown>): Promise<T> {
    return this.call<T>(service, method, params ?? {})
  }

  async post<T>(service: string, method: string, body: Record<string, unknown>): Promise<T> {
    return this.call<T>(service, method, body)
  }

  async delete(service: string, method: string, params: Record<string, unknown>): Promise<void> {
    await this.call(service, method, params)
  }
}
