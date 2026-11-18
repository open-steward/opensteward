import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

/**
 * Octopus API client.
 *
 * Every read is `POST <BaseURL>/Read` with a JSON body keyed by the object name
 * (https://developer.maximizer.com/reference/octopus-api-docs-read-query-syntax):
 *
 *   "The authentication token must be passed as a header - "Authorization" with
 *    the specified type `Bearer`."
 *   "A Code value of `0` indicates that the request was successful. A negative
 *    Code value indicates that an error occurred when processing the request."
 *   "For entity methods, the Data object is nested inside the root-level entity
 *    object corresponding to the method being called."
 */
function baseUrlFrom(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  const custom = extra?.['instanceUrl']
  const base = typeof custom === 'string' && custom.trim() ? custom.trim() : DEFAULT_BASE_URL
  return base.replace(/\/+$/, '')
}

async function send<T>(
  method: string,
  path: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrlFrom(credentials)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Maximizer API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

interface OctopusResponse {
  Code?: unknown
  Msg?: unknown
  [object: string]: unknown
}

function messages(msg: unknown): string {
  if (!Array.isArray(msg)) return ''
  return msg
    .map((m) =>
      typeof m === 'string'
        ? m
        : m && typeof m === 'object' && typeof (m as { Message?: unknown }).Message === 'string'
          ? (m as { Message: string }).Message
          : '',
    )
    .filter(Boolean)
    .join('; ')
}

export class MaximizerClient {
  constructor(private credentials: Credentials) {}

  /**
   * `POST /Read` for one object, returning `<object>.Data` — an array for a
   * Read. A negative `Code` (sent with HTTP 200) is an error.
   */
  async read<T>(object: string, body: Record<string, unknown>): Promise<T[]> {
    const res = await send<OctopusResponse>('POST', '/Read', this.credentials, body)
    if (res.Code !== 0) {
      throw Object.assign(
        new Error(
          `Maximizer ${object} Read failed (Code ${String(res.Code)}): ${messages(res.Msg)}`,
        ),
        { statusCode: 502 },
      )
    }
    const entity = res[object] as { Data?: unknown } | undefined
    const data = entity?.Data
    if (!Array.isArray(data)) {
      throw Object.assign(new Error(`Maximizer ${object} Read returned no ${object}.Data array`), {
        statusCode: 502,
      })
    }
    return data as T[]
  }

  // Write helpers below are unchanged and out of scope for the list rebuild:
  // the REST paths the write methods pass them are not documented Octopus
  // calls (Octopus writes are POST /Create, /Update and /Delete).

  async post<T>(path: string, body: unknown): Promise<T> {
    return send<T>('POST', path, this.credentials, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return send<T>('PUT', path, this.credentials, body)
  }

  async delete(path: string): Promise<void> {
    await send<void>('DELETE', path, this.credentials)
  }
}
