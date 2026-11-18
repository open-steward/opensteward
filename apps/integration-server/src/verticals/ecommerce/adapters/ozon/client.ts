/**
 * Ozon Seller API HTTP client.
 *
 * Every call is `POST https://api-seller.ozon.ru/<version>/<method>` with a
 * JSON body and two auth headers, `Client-Id` and `Api-Key`. Credentials never
 * go in the URL. Rate-limit breaches answer 429 and are retried with the
 * shared exponential backoff.
 *
 * Credentials layout (as returned by the Connect form in index.ts):
 *   accessToken      = Api-Key
 *   extra.clientId   = Client-Id
 *
 * Docs: https://docs.ozon.ru/api/seller/ ("Auth")
 */
import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

export class OzonClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const clientId = credentials.extra?.['clientId']
    if (typeof clientId !== 'string' || clientId === '') {
      throw new Error('OzonClient: credentials.extra.clientId (sent as the Client-Id header) is required.')
    }
    if (!credentials.accessToken) {
      throw new Error('OzonClient: credentials.accessToken (sent as the Api-Key header) is required.')
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Client-Id': clientId,
        'Api-Key': credentials.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
