import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '../../adapter/interface'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() }
    catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 429 && i < retries) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000)); continue }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * The OData service root comes from the connection's credentials (collected and
 * vetted by the Connect Link form); a deployment-level `baseUrl` is only a
 * fallback. There is deliberately no default host — the token must never be
 * sent to a server the customer did not name.
 */
export function resolveOneCBaseUrl(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['baseUrl']
  const baseUrl = typeof stored === 'string' && stored ? stored : fallback
  if (!baseUrl) throw new Error('1C connection is missing its OData URL — reconnect it through Connect Link.')
  return baseUrl
}

/**
 * 1C publishes its standard OData interface with web-service authentication,
 * which is HTTP Basic against an infobase user — the usual setup. A JWT bearer
 * works only when the publication's `default.vrd` enables
 * `accessTokenAuthentication`, which is a real 1C feature, so both are
 * supported rather than one replacing the other.
 *
 * A stored username is the deliberate signal: the credential form only writes
 * one on the Basic branch.
 */
export function oneCAuthHeader(credentials: Credentials): string {
  const username = credentials.extra?.['username']
  if (typeof username === 'string' && username) {
    const password = credentials.extra?.['password']
    const pair = `${username}:${typeof password === 'string' ? password : ''}`
    return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`
  }
  return `Bearer ${credentials.accessToken}`
}

export class OneCEnterpriseClient {
  private http: AxiosInstance
  constructor(credentials: Credentials, fallbackBaseUrl?: string) {
    this.http = axios.create({
      baseURL: `${resolveOneCBaseUrl(credentials, fallbackBaseUrl)}/`,
      headers: { Authorization: oneCAuthHeader(credentials), 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  }
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> { return withRetry(async () => { const { data } = await this.http.get<T>(path, { params }); return data }) }
  async post<T>(path: string, body: unknown): Promise<T> { return withRetry(async () => { const { data } = await this.http.post<T>(path, body); return data }) }
  async put<T>(path: string, body: unknown): Promise<T> { return withRetry(async () => { const { data } = await this.http.put<T>(path, body); return data }) }
  async delete(path: string): Promise<void> { return withRetry(async () => { await this.http.delete(path) }) }
}
