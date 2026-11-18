import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { FENBEITONG_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() }
    catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000)); continue }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class FenbeitongClient {
  private http: AxiosInstance
  constructor(credentials: Credentials) {
    const parts = credentials.accessToken.split('|||')
    const appKey = parts[0] ?? ''
    const appSecret = parts[1] ?? ''
    this.http = axios.create({
      baseURL: `${FENBEITONG_API_BASE}/`,
      headers: { 'App-Key': appKey, 'App-Secret': appSecret, 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  }
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> { return withRetry(async () => { const { data } = await this.http.get<T>(path, { params }); return data }) }
  async post<T>(path: string, body: unknown): Promise<T> { return withRetry(async () => { const { data } = await this.http.post<T>(path, body); return data }) }
  async put<T>(path: string, body: unknown): Promise<T> { return withRetry(async () => { const { data } = await this.http.put<T>(path, body); return data }) }
  async delete(path: string): Promise<void> { return withRetry(async () => { await this.http.delete(path) }) }
}
