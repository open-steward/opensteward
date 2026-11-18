import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

function authHeaders(credentials: Credentials): Record<string, string> {
  return {
    // TODO: Confirm header name — Ortto docs list both X-Api-Key and X-Ortto-Key
    'X-Api-Key': credentials.accessToken,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
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
    headers: authHeaders(credentials),
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Ortto API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  const text = await res.text()
  if (!text) return undefined as unknown as T
  return JSON.parse(text) as T
}

export class OrttoClient {
  constructor(private credentials: Credentials) {}

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, body)
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.credentials)
  }
}
