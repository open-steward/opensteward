import type { Credentials } from '@opensteward/shared'

const BASE_URL = 'https://api.podio.com'

export interface PodioItemField {
  external_id: string
  values: Array<Record<string, unknown>>
}

export interface PodioItem {
  item_id: number
  fields: PodioItemField[]
  [key: string]: unknown
}

interface PodioItemListResponse {
  total?: number
  filtered?: number
  items: PodioItem[]
}

function tokenFrom(credentials: Credentials): string {
  return credentials.accessToken
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `OAuth2 ${tokenFrom(credentials)}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Podio API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class PodioClient {
  constructor(private credentials: Credentials) {}

  async listItems(
    appId: string,
    limit = 25,
    offset = 0,
  ): Promise<{ items: PodioItem[]; total?: number; filtered?: number }> {
    const res = await request<PodioItemListResponse>(
      'GET',
      `/item/app/${appId}/?limit=${limit}&offset=${offset}`,
      this.credentials,
    )
    const count = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
    return { items: res.items ?? [], total: count(res.total), filtered: count(res.filtered) }
  }

  async getItem(itemId: string): Promise<PodioItem> {
    return request<PodioItem>('GET', `/item/${itemId}`, this.credentials)
  }

  async createItem(appId: string, body: unknown): Promise<PodioItem> {
    return request<PodioItem>('POST', `/item/app/${appId}/`, this.credentials, body)
  }

  async updateItem(itemId: string, body: unknown): Promise<PodioItem> {
    return request<PodioItem>('PUT', `/item/${itemId}`, this.credentials, body)
  }

  async deleteItem(itemId: string): Promise<void> {
    await request<void>('DELETE', `/item/${itemId}`, this.credentials)
  }

  async getApp(appId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/app/${appId}`, this.credentials)
  }

  async listComments(itemId: string): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>(
      'GET',
      `/comment/item/${itemId}`,
      this.credentials,
    )
  }

  async getComment(commentId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(
      'GET',
      `/comment/${commentId}`,
      this.credentials,
    )
  }

  async createComment(itemId: string, body: unknown): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(
      'POST',
      `/comment/item/${itemId}`,
      this.credentials,
      body,
    )
  }

  async deleteComment(commentId: string): Promise<void> {
    await request<void>('DELETE', `/comment/${commentId}`, this.credentials)
  }
}
