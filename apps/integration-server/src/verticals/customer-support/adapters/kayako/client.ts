/**
 * Kayako REST API client.
 *
 * Auth: Basic HTTP auth — Base64(email:password) in the Authorization header.
 * Base URL: per-tenant — https://{subdomain}.kayako.com/api/v1
 * Pagination: offset-based — query params `limit` and `offset`.
 * Response envelope: { status, data, resource, total_count, next_url? }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export interface KayakoEnvelope<T> {
  status: number
  data: T
  resource?: string
  total_count?: number
  next_url?: string | null
}

export class KayakoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const subdomain = String(credentials.extra?.['subdomain'] ?? '')
    const password = String(credentials.extra?.['password'] ?? '')
    const email = credentials.accessToken
    const baseURL = API_BASE_URL_TEMPLATE.replace('{subdomain}', subdomain)
    const token = Buffer.from(`${email}:${password}`).toString('base64')

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<KayakoEnvelope<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get<KayakoEnvelope<T>>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<KayakoEnvelope<T>> {
    return withRetry(async () => {
      const { data } = await this.http.post<KayakoEnvelope<T>>(path, body)
      return data
    })
  }
}
