import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

let _rpcId = 1

function nextId(): number {
  return _rpcId++
}

export class RexCrmClient {
  constructor(private credentials: Credentials) {}

  private get authHeader(): string {
    return `Bearer ${this.credentials.accessToken}`
  }

  /**
   * Send a JSON-RPC 2.0 request to the Rex Software API.
   * All Rex API methods are called via POST to the same endpoint.
   */
  async call<T>(method: string, input?: unknown): Promise<T> {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        method,
        input: input ?? {},
        id: nextId(),
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Rex CRM API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    return res.json() as Promise<T>
  }

  /**
   * List operation using JSON-RPC search method.
   * Rex search methods return { result: { rows: [...], total: number } }
   */
  async list<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const res = await this.call<{ result?: { rows?: T[] } }>(method, {
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
      ...params,
    })
    const items = res?.result?.rows ?? []
    return { items: Array.isArray(items) ? items : [] }
  }

  /**
   * Read a single record by ID.
   * Rex read methods return { result: { ... } }
   */
  async read<T>(method: string, id: string | number): Promise<T> {
    const res = await this.call<{ result?: T }>(method, { id })
    if (!res.result) throw Object.assign(new Error(`Rex CRM: record ${id} not found`), { statusCode: 404 })
    return res.result
  }

  /**
   * Create a record. Returns { result: { id: number } }
   */
  async create<T>(method: string, data: Record<string, unknown>): Promise<T> {
    const res = await this.call<{ result?: T }>(method, data)
    if (!res.result) throw new Error(`Rex CRM: create failed for ${method}`)
    return res.result
  }

  /**
   * Update a record by ID.
   */
  async update<T>(method: string, id: string | number, data: Record<string, unknown>): Promise<T> {
    const res = await this.call<{ result?: T }>(method, { id, ...data })
    if (!res.result) throw new Error(`Rex CRM: update failed for ${method}/${id}`)
    return res.result
  }

  /**
   * Delete a record by ID.
   */
  async delete(method: string, id: string | number): Promise<void> {
    await this.call<unknown>(method, { id })
  }
}
