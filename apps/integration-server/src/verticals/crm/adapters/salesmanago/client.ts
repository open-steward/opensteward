import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'
import { createHash } from 'node:crypto'

// SALESmanago uses clientId + apiSecret in request body (SHA1 HMAC signature)
// accessToken = clientId, extra.apiSecret = apiSecret, extra.endpoint = custom endpoint (optional)

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

function buildAuth(clientId: string, apiSecret: string): Record<string, string> {
  const time = Date.now()
  const sha = sha1(`${apiSecret}${clientId}${time}`)
  return {
    clientId,
    apiKey: sha,
    requestTime: String(time),
  }
}

async function request<T>(
  method: string,
  path: string,
  clientId: string,
  apiSecret: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
  if (method === 'GET' && params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const authPayload = buildAuth(clientId, apiSecret)
  const payload = method !== 'GET' ? { ...authPayload, ...(body ?? {}) } : undefined

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: payload != null ? JSON.stringify(payload) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`SALESmanago API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class SalesmanagoCli {
  private clientId: string
  private apiSecret: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.clientId = credentials.accessToken
    this.apiSecret = (credentials.extra?.['apiSecret'] as string | undefined) ?? ''
    const endpoint = (credentials.extra?.['endpoint'] as string | undefined)
    this.baseUrl = endpoint ?? BASE_URL
  }

  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return request<T>('POST', path, this.clientId, this.apiSecret, this.baseUrl, undefined, body)
  }

  async list<T>(path: string, params: Record<string, unknown> = {}): Promise<{ items: T[] }> {
    const from = Number(params['offset'] ?? 0)
    const size = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    // SALESmanago uses POST for list endpoints too
    const res = await request<{ contacts?: T[]; result?: T[] }>(
      'POST', path, this.clientId, this.apiSecret, this.baseUrl, undefined, { from, size },
    )
    const items = (res.contacts ?? res.result ?? []) as T[]
    return { items }
  }
}
