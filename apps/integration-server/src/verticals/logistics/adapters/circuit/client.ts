import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { CIRCUIT_API_BASE } from './constants'
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

// Circuit uses HTTP Basic auth where the API key is passed as the username
// with empty password. We send `Authorization: Basic base64(key:)`.
export class CircuitClient {
  private http: AxiosInstance
  constructor(credentials: Credentials) {
    const basic = Buffer.from(`${credentials.accessToken}:`).toString('base64')
    this.http = axios.create({
      baseURL: CIRCUIT_API_BASE,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
