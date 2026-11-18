import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE } from './constants'

export interface KintoneRecord {
  $id: { value: string }
  $revision: { value: string }
  [field: string]: { value: unknown; type?: string }
}

export interface KintoneRecordsResponse {
  records: KintoneRecord[]
  totalCount?: string
}

export interface KintoneRecordResponse {
  record: KintoneRecord
}

function baseUrl(subdomain: string): string {
  return `https://${subdomain}.kintone.com/k/v1`
}

async function request<T>(
  method: string,
  url: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params && method === 'GET') {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fullUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      'X-Cybozu-API-Token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Kintone API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class KintoneClient {
  private token: string
  private subdomain: string

  constructor(credentials: Credentials) {
    const subdomain = credentials.extra?.['subdomain'] as string | undefined
    if (!subdomain) throw new Error('Kintone: subdomain is required in credentials.extra.subdomain')
    this.token = credentials.accessToken
    this.subdomain = subdomain
  }

  getAppId(credentials: Credentials, key: string): string | undefined {
    return credentials.extra?.[key] as string | undefined
  }

  async listRecords(appId: string, params: { limit?: number; offset?: number } = {}): Promise<KintoneRecord[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.offset ?? 0
    const url = `${baseUrl(this.subdomain)}/records.json`
    const res = await request<KintoneRecordsResponse>('GET', url, this.token, {
      app: appId,
      totalCount: true,
      query: `limit ${limit} offset ${offset}`,
    })
    return res.records ?? []
  }

  async getRecord(appId: string, id: string): Promise<KintoneRecord> {
    const url = `${baseUrl(this.subdomain)}/record.json`
    const res = await request<KintoneRecordResponse>('GET', url, this.token, { app: appId, id })
    return res.record
  }

  async createRecord(appId: string, record: Record<string, unknown>): Promise<{ id: string; revision: string }> {
    const url = `${baseUrl(this.subdomain)}/record.json`
    const res = await request<{ id: string; revision: string }>('POST', url, this.token, undefined, {
      app: appId,
      record,
    })
    return res
  }

  async updateRecord(appId: string, id: string, record: Record<string, unknown>): Promise<void> {
    const url = `${baseUrl(this.subdomain)}/record.json`
    await request<unknown>('PUT', url, this.token, undefined, {
      app: appId,
      id,
      record,
    })
  }

  async deleteRecords(appId: string, ids: string[]): Promise<void> {
    const url = `${baseUrl(this.subdomain)}/records.json`
    await request<unknown>('DELETE', url, this.token, undefined, {
      app: appId,
      ids: ids.map(Number),
    })
  }
}
