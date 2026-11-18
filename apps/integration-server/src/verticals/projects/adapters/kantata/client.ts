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
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * A reference returned in the canonical `results` array of every Kantata OX
 * list response: `{ key: '<typename>', id: '<id>' }`.
 */
export interface KantataResultRef {
  key: string
  id: string
}

/**
 * The shared Kantata OX response envelope. Collections are keyed by id under a
 * top-level map named after the resource type (e.g. `workspaces`, `stories`).
 * The canonical, ordered set of primary records is the `results` array — always
 * iterate it rather than the typed map, since side-loaded associations of the
 * same type are mixed into the map.
 */
export interface KantataEnvelope {
  count?: number
  results?: KantataResultRef[]
  meta?: { count?: number; page_count?: number; page_number?: number; page_size?: number }
  [resourceType: string]: unknown
}

/**
 * Resolve the canonical, ordered primary records of a list response by walking
 * the `results` array and looking each reference up in its typed map.
 */
export function resolveResults<T extends { id?: string }>(env: KantataEnvelope): T[] {
  const refs = env.results ?? []
  const out: T[] = []
  for (const ref of refs) {
    const map = env[ref.key] as Record<string, T> | undefined
    const obj = map?.[ref.id]
    if (obj) out.push(obj)
  }
  return out
}

/**
 * Look up a single side-loaded / primary object by type + id from the envelope.
 */
export function lookup<T extends { id?: string }>(
  env: KantataEnvelope,
  resourceType: string,
  id: string | undefined,
): T | undefined {
  if (!id) return undefined
  const map = env[resourceType] as Record<string, T> | undefined
  return map?.[id]
}

export class KantataClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get(path: string, params?: Record<string, unknown>): Promise<KantataEnvelope> {
    return withRetry(async () => {
      const { data } = await this.http.get<KantataEnvelope>(path, { params })
      return data
    })
  }
}
