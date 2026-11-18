import type { Credentials } from '@opensteward/shared'
import { API_VERSION } from './constants'
import { normaliseInstanceUrl } from './auth'

/**
 * The Dataverse environment stored with the credentials, re-validated: the
 * bearer token is sent there, so a missing value or one outside Microsoft's
 * Dataverse domains throws a readable error instead of producing a request.
 */
function instanceUrl(credentials: Credentials): string {
  const url = credentials.extra?.['instanceUrl']
  return normaliseInstanceUrl(typeof url === 'string' ? url : undefined)
}

function baseUrl(credentials: Credentials): string {
  return `${instanceUrl(credentials)}/api/data/${API_VERSION}`
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...(method === 'POST' || method === 'PATCH'
        ? { 'Prefer': 'return=representation' }
        : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (method === 'DELETE' && (res.status === 204 || res.status === 200)) {
    return undefined as unknown as T
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Dynamics365 API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export interface ODataListResponse<T> {
  value: T[]
  '@odata.nextLink'?: string
}

export class Dynamics365Client {
  constructor(private credentials: Credentials) {}

  async list<T>(
    entity: string,
    params: Record<string, string | number> = {},
  ): Promise<{ items: T[]; nextLink?: string }> {
    const url = new URL(`${baseUrl(this.credentials)}/${entity}`)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }
    const res = await request<ODataListResponse<T>>('GET', url.toString(), this.credentials)
    return {
      items: res.value ?? [],
      nextLink: res['@odata.nextLink'],
    }
  }

  async get<T>(entity: string, id: string): Promise<T> {
    const url = `${baseUrl(this.credentials)}/${entity}(${id})`
    return request<T>('GET', url, this.credentials)
  }

  async post<T>(entity: string, body: unknown): Promise<T> {
    const url = `${baseUrl(this.credentials)}/${entity}`
    return request<T>('POST', url, this.credentials, body)
  }

  async patch<T>(entity: string, id: string, body: unknown): Promise<T> {
    // With Prefer: return=representation, PATCH returns the updated entity
    const url = `${baseUrl(this.credentials)}/${entity}(${id})`
    const res = await request<T | undefined>('PATCH', url, this.credentials, body)
    if (res !== undefined) return res
    // If 204 returned despite Prefer header, fetch the entity
    return this.get<T>(entity, id)
  }

  async delete(entity: string, id: string): Promise<void> {
    const url = `${baseUrl(this.credentials)}/${entity}(${id})`
    await request<void>('DELETE', url, this.credentials)
  }
}
