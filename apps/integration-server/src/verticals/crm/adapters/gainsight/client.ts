/**
 * Gainsight NXT HTTP client.
 *
 * Adds the `Accesskey` header to every request and provides typed
 * helpers for the main HTTP verbs used by Gainsight's REST APIs.
 */
import type { Credentials } from '@opensteward/shared'
import { ACCESS_KEY_HEADER } from './constants'

async function request<T>(
  method: string,
  url: string,
  accessKey: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      [ACCESS_KEY_HEADER]: accessKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Gainsight API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class GainsightClient {
  private readonly accessKey: string
  /** Tenant subdomain for cockpit (CTA/task) calls, e.g. "acme" in acme.gainsightcloud.com */
  readonly tenantDomain: string | undefined

  constructor(credentials: Credentials) {
    this.accessKey = credentials.accessToken
    const extra = credentials.extra as Record<string, unknown> | undefined
    this.tenantDomain = (extra?.['domain'] as string | undefined)?.trim() || undefined
  }

  /** Build base URL for cockpit (CTA/task) API using the tenant domain. */
  cockpitBase(): string {
    const host = this.tenantDomain
      ? `${this.tenantDomain}.gainsightcloud.com`
      : 'app.gainsightcloud.com'
    return `https://${host}`
  }

  async get<T>(url: string): Promise<T> {
    return request<T>('GET', url, this.accessKey)
  }

  async post<T>(url: string, body: unknown): Promise<T> {
    return request<T>('POST', url, this.accessKey, body)
  }

  async put<T>(url: string, body: unknown): Promise<T> {
    return request<T>('PUT', url, this.accessKey, body)
  }

  async delete(url: string): Promise<void> {
    await request<void>('DELETE', url, this.accessKey)
  }
}
