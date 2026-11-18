import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

export class TeamleaderClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async action<T>(action: string, body: unknown = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}/${action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Teamleader API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  async list<T>(
    action: string,
    params: { page?: number; pageSize?: number } = {},
  ): Promise<{ items: T[] }> {
    const res = await this.action<{ data: T[] }>(action, {
      filter: {},
      page: { size: params.pageSize ?? DEFAULT_PAGE_SIZE, number: params.page ?? 1 },
    })
    return { items: res.data ?? [] }
  }
}
