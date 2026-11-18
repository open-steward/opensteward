import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

interface RpcResponse<T> {
  result: T | null
  error?: { code: number; message: string }
  id: string | number
}

export class NutshellClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ method, params, id: String(Date.now()) }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Nutshell API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    const json = await res.json() as RpcResponse<T>
    if (json.error) {
      throw Object.assign(
        new Error(`Nutshell RPC error ${json.error.code}: ${json.error.message}`),
        { statusCode: 400 },
      )
    }
    if (json.result === null || json.result === undefined) {
      throw Object.assign(
        new Error(`Nutshell: ${method} returned null result`),
        { statusCode: 404 },
      )
    }
    return json.result
  }

  async list<T>(
    method: string,
    params: Record<string, unknown> = {},
    page = 0,
    perPage: number = DEFAULT_PAGE_SIZE,
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const result = await this.rpc<T[] | Record<string, T[]>>(method, {
      ...params,
      page,
      perPage,
    })

    let items: T[]
    if (Array.isArray(result)) {
      items = result
    } else {
      // Some methods return { results: [...] } or similar
      const values = Object.values(result as Record<string, unknown>)
      items = (values.find((v) => Array.isArray(v)) as T[] | undefined) ?? []
    }

    return { items, hasMore: items.length >= perPage }
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return this.rpc<T>(method, params)
  }
}
