import axios, { type AxiosInstance } from 'axios'
import { assertPublicHost, withRetry as withRetryBase } from '@opensteward/shared'
import { authHeader, karrioApiBase, normaliseKarrioHost } from './auth'
import type { Credentials } from '../../adapter/interface'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * The connection's Karrio instance: `credentials.extra.baseUrl`, collected on
 * the Connect form, or the adapter's deployment `baseUrl` config when the
 * connection carries none. Karrio has no shared host, so with neither this throws.
 */
export function karrioHost(credentials: Credentials, configBaseUrl?: string): string {
  const fromConnection = credentials.extra?.['baseUrl']
  if (typeof fromConnection === 'string' && fromConnection.trim() !== '')
    return normaliseKarrioHost(fromConnection)
  if (typeof configBaseUrl === 'string' && configBaseUrl.trim() !== '')
    return normaliseKarrioHost(configBaseUrl)
  throw new Error(
    'Karrio is self-hosted: this connection has no Karrio API URL. Reconnect and enter your instance URL.',
  )
}

export class KarrioClient {
  private http: AxiosInstance
  /** The instance this client talks to (`https://host[/prefix]`). */
  readonly host: string
  private readonly hostname: string
  private hostCheck?: Promise<void>

  constructor(credentials: Credentials, configBaseUrl?: string) {
    this.host = karrioHost(credentials, configBaseUrl)
    this.hostname = new URL(this.host).hostname
    this.http = axios.create({
      baseURL: karrioApiBase(this.host),
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** The host is customer-supplied: vet it once before the API key goes to it. */
  private ensurePublicHost(): Promise<void> {
    return (this.hostCheck ??= assertPublicHost(this.hostname))
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    await this.ensurePublicHost()
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
