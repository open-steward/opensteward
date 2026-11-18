import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

export class WorkbooksClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  private url(path: string): string {
    const u = new URL(`${BASE_URL}${path}`)
    u.searchParams.set('api_key', this.apiKey)
    return u.toString()
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const u = new URL(`${BASE_URL}${path}`)
    u.searchParams.set('api_key', this.apiKey)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        u.searchParams.set(k, v)
      }
    }
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'opensteward/1.0' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Workbooks API error ${res.status}: ${text}`), { statusCode: res.status })
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'opensteward/1.0',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Workbooks API error ${res.status}: ${text}`), { statusCode: res.status })
    }
    return res.json() as Promise<T>
  }
}
