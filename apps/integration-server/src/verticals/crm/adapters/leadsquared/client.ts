import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

export class LeadsquaredClient {
  private accessKey: string
  private secretKey: string

  constructor(credentials: Credentials) {
    this.accessKey = credentials.accessToken
    this.secretKey = credentials.refreshToken ?? ''
  }

  private url(path: string): string {
    const u = new URL(`${BASE_URL}${path}`)
    u.searchParams.set('accessKey', this.accessKey)
    u.searchParams.set('secretKey', this.secretKey)
    return u.toString()
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`LeadSquared API error ${res.status}: ${text}`), { statusCode: res.status })
    }
    return res.json() as Promise<T>
  }
}
