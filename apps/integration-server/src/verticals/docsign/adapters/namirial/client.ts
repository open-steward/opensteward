/**
 * Namirial eSignAnyWhere REST API v6 client.
 *
 * `https://<host>/api` + the swagger's `/v6/…` routes
 * (https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json:
 * `"basePath": "/api"`). The host is the connection's own environment
 * (`credentials.extra.host`) and is checked to resolve to a public address
 * before the token is sent to it. Bearer-token auth + JSON. Retries 429 + 5xx
 * with exponential backoff.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'
import { assertPublicNamirialHost, connectionNamirialHost } from './auth'

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

export class NamirialClient {
  private http: AxiosInstance
  private host: string
  private vetted: Promise<void> | undefined

  constructor(credentials: Credentials) {
    this.host = connectionNamirialHost(credentials)
    this.http = axios.create({
      baseURL: `https://${this.host}${API_BASE_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Refuse a host that resolves to a private address before sending the token. */
  private ready(): Promise<void> {
    this.vetted ??= assertPublicNamirialHost(this.host)
    return this.vetted
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ready()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    await this.ready()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
