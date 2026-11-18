import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { ROUTE4ME_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() } catch (err) {
      const ae = err as AxiosError
      if (ae.response?.status === 429 && i < retries) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000)); continue }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class Route4MeClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials, baseURL: string = ROUTE4ME_API_BASE) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () =>
      (await this.http.get<T>(path, { params: { ...params, api_key: this.apiKey } })).data,
    )
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () =>
      (await this.http.post<T>(path, body, { params: { api_key: this.apiKey } })).data,
    )
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () =>
      (await this.http.put<T>(path, body, { params: { api_key: this.apiKey } })).data,
    )
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () =>
      (await this.http.delete<T>(path, { params: { ...params, api_key: this.apiKey } })).data,
    )
  }
}
