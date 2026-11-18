import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type DLocalEnvironment } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class DLocalClient {
  private http: AxiosInstance
  private xLogin: string
  private xTransKey: string
  private secret: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as DLocalEnvironment) ?? DEFAULT_ENVIRONMENT
    this.xLogin = String(extra.xLogin ?? '')
    this.xTransKey = String(extra.xTransKey ?? '')
    this.secret = credentials.accessToken
    this.http = axios.create({
      baseURL: HOSTS[env],
      timeout: 30_000,
    })
  }

  private headers(body: string): Record<string, string> {
    const xDate = new Date().toISOString()
    const signature = createHmac('sha256', this.secret)
      .update(`${this.xLogin}${xDate}${body}`, 'utf8')
      .digest('hex')
    return {
      'X-Date': xDate,
      'X-Login': this.xLogin,
      'X-Trans-Key': this.xTransKey,
      'X-Version': '2.1',
      Authorization: `V2-HMAC-SHA256, Signature: ${signature}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { headers: this.headers('') })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const bodyJson = JSON.stringify(body ?? {})
      const { data } = await this.http.post<T>(path, bodyJson, { headers: this.headers(bodyJson) })
      return data
    })
  }
}
