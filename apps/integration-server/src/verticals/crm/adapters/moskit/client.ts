import type { Credentials } from '@opensteward/shared'
import { BASE_URL, TOTAL_HEADER } from './constants'

interface Response<T> {
  body: T
  headers: Headers
}

/**
 * Auth: "Você deverá enviar este valor em todos os requests para a API em um
 * header `apikey`" (Considerações iniciais). Bodies are JSON both ways.
 */
async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<Response<T>> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      apikey: credentials.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Moskit API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return { body: undefined as unknown as T, headers: res.headers }
  return { body: (await res.json()) as T, headers: res.headers }
}

/** One page of a documented list: the bare array body and the listing total header. */
export interface MoskitPage<T> {
  items: T[]
  /** `X-Ollow-Listing-Total`, when the response carried a whole number there. */
  total?: number
}

function readTotal(headers: Headers): number | undefined {
  const raw = headers.get(TOTAL_HEADER)
  if (raw === null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

export class MoskitClient {
  constructor(private credentials: Credentials) {}

  /**
   * A documented list: every list operation's 200 response is
   * `type: array` of the model. Anything else is an error, never an empty
   * last page, which the sync would take as a complete, empty collection.
   */
  async listPage<T>(path: string, params: Record<string, unknown>): Promise<MoskitPage<T>> {
    const { body, headers } = await request<unknown>('GET', path, this.credentials, params)
    if (!Array.isArray(body)) {
      throw Object.assign(new Error(`Moskit GET ${path} returned a body that is not an array`), {
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      })
    }
    const total = readTotal(headers)
    return { items: body as T[], ...(total !== undefined ? { total } : {}) }
  }

  async get<T>(path: string): Promise<T> {
    return (await request<T>('GET', path, this.credentials)).body
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return (await request<T>('POST', path, this.credentials, undefined, body)).body
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return (await request<T>('PUT', path, this.credentials, undefined, body)).body
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
