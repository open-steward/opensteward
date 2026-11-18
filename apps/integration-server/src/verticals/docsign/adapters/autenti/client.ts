import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * A document process id as a path segment. Autenti ids carry their
 * namespace ("DOCUMENT_PROCESS:xxxxxxxx-…") and the docs send it literally:
 * "GET https://api.autenti.com/api/v2/document-processes/DOCUMENT_PROCESS:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 * ("Retrieving details of specific document", node ea8c0f2650587). Everything
 * else that is not path-safe is escaped.
 */
export function idSegment(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ':')
}

/**
 * The records of a streaming response. "Streaming response, using concatenated
 * JSON (JSON records concatenated with no seprators, or separated with
 * whitespace only. including new lines)" ("Streaming vs JSON array queries",
 * node aeea144bc9795). Each top-level value must be a JSON object: a JSON
 * array here would be the paginated representation, which may be one page
 * only, so it is an error rather than the whole list.
 */
export function parseConcatenatedJson(text: string, path: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (depth === 0) {
      if (/\s/.test(ch)) continue
      if (ch !== '{') throw new Error(`Autenti ${path} streamed a record that is not a JSON object`)
      start = i
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) out.push(JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>)
    }
  }
  if (depth !== 0 || inString) throw new Error(`Autenti ${path} streamed a truncated record`)
  return out
}

export class AutentiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        // application/json selects the paginated JSON-array representation
        // ("Streaming vs JSON array queries", node aeea144bc9795).
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * A whole collection as a stream. The paginated JSON array holds "maximum
   * 128 documents, while the streaming response is unbounded", and the
   * representation is chosen by the `Accept` header for "lists of documents
   * (and other lists, like lists of participants, files, events)" (node
   * aeea144bc9795). "Listing files" (node bq2nod4bpilzk) shows the request
   * with "Accept: application/stream+json".
   */
  async getStream(path: string): Promise<Record<string, unknown>[]> {
    return withRetry(async () => {
      const { data } = await this.http.get<string>(path, {
        headers: { Accept: 'application/stream+json' },
        responseType: 'text',
        transformResponse: [(body: unknown) => body],
      })
      return parseConcatenatedJson(typeof data === 'string' ? data : String(data), path)
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
