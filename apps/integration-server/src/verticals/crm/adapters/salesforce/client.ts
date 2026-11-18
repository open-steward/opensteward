import type { Credentials } from '@opensteward/shared'
import { API_VERSION } from './constants'

function instanceUrl(credentials: Credentials): string {
  const url = credentials.extra?.['instanceUrl']
  if (typeof url !== 'string' || !url) {
    throw new Error('Salesforce client: instanceUrl missing from credentials.extra')
  }
  return url.replace(/\/$/, '')
}

function baseUrl(credentials: Credentials): string {
  return `${instanceUrl(credentials)}/services/data/${API_VERSION}`
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...extraHeaders,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (method === 'DELETE' && res.status === 204) {
    return undefined as unknown as T
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Salesforce API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export interface SalesforceQueryResponse<T> {
  totalSize: number
  done: boolean
  nextRecordsUrl?: string
  records: T[]
}

export class SalesforceClient {
  constructor(private credentials: Credentials) {}

  /**
   * `batchSize`, when given, sets `Sforce-Query-Options: batchSize=N` on this
   * request only — it governs how many rows THIS response (and every
   * `queryNext` continuation of it) carries per page. Omit it to take
   * Salesforce's default (2000).
   */
  async query<T>(soql: string, batchSize?: number): Promise<SalesforceQueryResponse<T>> {
    const url = `${baseUrl(this.credentials)}/query?q=${encodeURIComponent(soql)}`
    const headers =
      batchSize != null ? { 'Sforce-Query-Options': `batchSize=${batchSize}` } : undefined
    return request<SalesforceQueryResponse<T>>('GET', url, this.credentials, undefined, headers)
  }

  async queryNext<T>(nextRecordsUrl: string): Promise<SalesforceQueryResponse<T>> {
    const base = instanceUrl(this.credentials)
    const url = nextRecordsUrl.startsWith('http') ? nextRecordsUrl : `${base}${nextRecordsUrl}`
    return request<SalesforceQueryResponse<T>>('GET', url, this.credentials)
  }

  async get<T>(sobject: string, id: string): Promise<T> {
    const url = `${baseUrl(this.credentials)}/sobjects/${sobject}/${id}`
    return request<T>('GET', url, this.credentials)
  }

  async post(sobject: string, body: unknown): Promise<{ id: string }> {
    const url = `${baseUrl(this.credentials)}/sobjects/${sobject}`
    return request<{ id: string }>('POST', url, this.credentials, body)
  }

  async patch(sobject: string, id: string, body: unknown): Promise<void> {
    const url = `${baseUrl(this.credentials)}/sobjects/${sobject}/${id}`
    await request<void>('PATCH', url, this.credentials, body)
  }

  async delete(sobject: string, id: string): Promise<void> {
    const url = `${baseUrl(this.credentials)}/sobjects/${sobject}/${id}`
    await request<void>('DELETE', url, this.credentials)
  }

  async describe(sobject: string): Promise<Record<string, unknown>> {
    const url = `${baseUrl(this.credentials)}/sobjects/${sobject}/describe`
    return request<Record<string, unknown>>('GET', url, this.credentials)
  }
}
