import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { TOOKAN_API_BASE } from './constants'
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

// Tookan accepts the API key inside the JSON body as `api_key` for POST,
// and as a query parameter for GET.
export class TookanClient {
  private http: AxiosInstance
  private apiKey: string
  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: TOOKAN_API_BASE,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  }
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params: { ...params, api_key: this.apiKey } })).data)
  }
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, { ...body, api_key: this.apiKey })).data)
  }
}
