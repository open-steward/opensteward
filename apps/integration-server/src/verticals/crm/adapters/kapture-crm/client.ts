import type { Credentials } from '@opensteward/shared'

// Kapture CRM: auth key header auth
// Header: auth: <auth_key>
// Base URL: https://{subdomain}.kapturecrm.com/api/
// Docs: https://dev.kapture.cx/kapture-api/
//
// UNVERIFIED: only the write methods still use this client. Kapture's docs
// show neither this /api/ base nor the `auth` header; every documented call
// is a POST with `Authorization: Basic <Your Token>` to a *.html or /ms/...
// path. All reads refuse with 501 before building a client (see index.ts).

async function request<T>(
  method: string,
  path: string,
  authKey: string,
  subdomain: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = `https://${subdomain}.kapturecrm.com/api/`
  const url = new URL(`${baseUrl}${path}`)

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // TODO: confirm header name — Kapture docs list both 'auth' and 'Authorization'
      auth: authKey,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Kapture CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class KaptureCrmClient {
  private authKey: string
  private subdomain: string

  constructor(credentials: Credentials) {
    const subdomain = credentials.extra?.['subdomain'] as string | undefined
    if (!subdomain) throw new Error('Kapture CRM: credentials.extra.subdomain is required')
    this.authKey = credentials.accessToken
    this.subdomain = subdomain
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>('POST', path, this.authKey, this.subdomain, body)
    return (res?.data ?? res) as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data?: T }>('PUT', path, this.authKey, this.subdomain, body)
    return (res?.data ?? res) as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.authKey, this.subdomain)
  }
}
