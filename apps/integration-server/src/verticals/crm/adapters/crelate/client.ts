/**
 * Crelate REST client.
 *
 * Reads: Crelate API v3 (https://app.crelate.com/api3), authenticated with the
 * `X-Api-Key` header — the spec's only security scheme: "A valid API key must
 * appear in the HTTP headers as `X-Api-Key`."
 *
 * Every v3 response uses one envelope: "All responses returned by the Crelate
 * API are in the same structure, which is comprised of the following three
 * properties: `Data`, [Metadata](...), and [Errors](...)." On a list, the
 * paging signal is `Metadata.MoreRecords`: "Whether there are more records in
 * a paged set after the current page."
 *
 * Writes: the legacy v1 request below, unchanged (see constants.ts).
 */

import type { Credentials } from '@opensteward/shared'
import { BASE_URL, LEGACY_V1_BASE_URL } from './constants'

/** CrelateResponseMetadata — only the fields this adapter reads. */
export interface CrelateResponseMetadata {
  /** "Whether there are more records in a paged set after the current page." */
  MoreRecords?: boolean | null
  /** "The total number of records in a paged set." */
  TotalRecords?: number | null
}

/** The v3 envelope: `Data`, `Errors`, `Metadata`. */
export interface CrelateEnvelope<T> {
  Data?: T | null
  Errors?: unknown[]
  Metadata?: CrelateResponseMetadata
}

function throwForStatus(status: number, text: string): never {
  throw Object.assign(new Error(`Crelate API error ${status}: ${text}`), { statusCode: status })
}

export class CrelateClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  /** GET a v3 path and return its envelope. */
  private async v3<T>(path: string, query: Record<string, string>): Promise<CrelateEnvelope<T>> {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
    })
    if (!res.ok) throwForStatus(res.status, await res.text().catch(() => res.statusText))
    return (await res.json()) as CrelateEnvelope<T>
  }

  /** One page of a v3 list endpoint: its `Data` rows and `Metadata`. */
  async list<T>(
    path: string,
    query: Record<string, string>,
  ): Promise<{ items: T[]; metadata: CrelateResponseMetadata }> {
    const env = await this.v3<T[]>(path, query)
    return { items: env.Data ?? [], metadata: env.Metadata ?? {} }
  }

  /** One v3 record by id; a null `Data` is a 404. */
  async get<T>(path: string): Promise<T> {
    const env = await this.v3<T>(path, {})
    if (env.Data == null) throwForStatus(404, `no record at ${path}`)
    return env.Data
  }

  // ── Legacy v1 writes (out of scope of the read rebuild; v1 answers 410) ──

  private async legacy<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(`${LEGACY_V1_BASE_URL}${path}`)
    url.searchParams.set('api_key', this.apiKey)
    const res = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throwForStatus(res.status, await res.text().catch(() => res.statusText))
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.legacy<T>('POST', path, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.legacy<T>('PUT', path, body)
  }

  async delete(path: string): Promise<void> {
    await this.legacy<void>('DELETE', path)
  }
}
