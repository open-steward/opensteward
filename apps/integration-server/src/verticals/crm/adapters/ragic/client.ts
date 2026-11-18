import type { Credentials } from '@opensteward/shared'
import { RAGIC_API_HOST, DEFAULT_PAGE_SIZE } from './constants'

// Ragic records are returned as an object keyed by record ID
// e.g. { "1": { "_ragic_id": 1, "Name": "...", ... }, "2": {...} }
export type RagicRecordMap = Record<string, RagicRecord>

export interface RagicRecord {
  _ragic_id?: number | string
  [field: string]: unknown
}

function buildBasicAuth(apiKey: string): string {
  // Ragic Basic Auth: base64(api_key + ":1")
  const token = Buffer.from(`${apiKey}:1`).toString('base64')
  return `Basic ${token}`
}

async function request<T>(
  method: string,
  url: string,
  auth: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fullUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Ragic API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class RagicClient {
  private auth: string
  private account: string

  constructor(credentials: Credentials) {
    const account = credentials.extra?.['account'] as string | undefined
    if (!account) throw new Error('Ragic: account is required in credentials.extra.account')
    this.auth = buildBasicAuth(credentials.accessToken)
    this.account = account
  }

  private sheetUrl(sheetPath: string): string {
    return `${RAGIC_API_HOST}/${this.account}/${sheetPath}`
  }

  async listRecords(
    sheetPath: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<RagicRecord[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.offset ?? 0
    const url = this.sheetUrl(sheetPath)
    const res = await request<RagicRecordMap>('GET', url, this.auth, {
      // Ragic uses 'limit' and 'offset' for pagination
      limit,
      offset,
    })
    // Convert object map to array
    return Object.values(res ?? {})
  }

  async getRecord(sheetPath: string, id: string): Promise<RagicRecord> {
    const url = `${this.sheetUrl(sheetPath)}/${id}`
    return request<RagicRecord>('GET', url, this.auth)
  }

  async createRecord(sheetPath: string, record: Record<string, unknown>): Promise<{ _ragic_id: string }> {
    const url = this.sheetUrl(sheetPath)
    const res = await request<{ _ragic_id: string | number }>('POST', url, this.auth, undefined, record)
    return { _ragic_id: String(res._ragic_id) }
  }

  async updateRecord(sheetPath: string, id: string, record: Record<string, unknown>): Promise<void> {
    const url = `${this.sheetUrl(sheetPath)}/${id}`
    await request<unknown>('POST', url, this.auth, undefined, record)
  }

  async deleteRecord(sheetPath: string, id: string): Promise<void> {
    const url = `${this.sheetUrl(sheetPath)}/${id}`
    await request<unknown>('DELETE', url, this.auth)
  }
}
