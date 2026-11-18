import axios, { type AxiosInstance } from 'axios'
import { INVOICEXPRESS_API_BASE_TEMPLATE } from './constants'
import { isInvoiceXpressAccountName } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class InvoiceXpressClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const accountName = credentials.extra?.['accountName']
    if (!isInvoiceXpressAccountName(accountName)) {
      throw new Error(
        'InvoiceXpress connection is missing its account name (or it is not a valid app.invoicexpress.com account) — reconnect it through Connect Link.',
      )
    }
    const baseURL = INVOICEXPRESS_API_BASE_TEMPLATE.replace('{account}', accountName)

    this.http = axios.create({
      baseURL: `${baseURL}/`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private withApiKey(params?: Record<string, unknown>): Record<string, unknown> {
    return { ...params, api_key: this.apiKey }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.withApiKey(params) })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.withApiKey(),
      })
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        params: this.withApiKey(),
      })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params: this.withApiKey() })
    })
  }
}
