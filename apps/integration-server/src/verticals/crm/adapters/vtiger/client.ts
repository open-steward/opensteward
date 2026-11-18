import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

/** Every Vtiger response wraps data in success + result. */
interface VtigerResponse<T> {
  success: boolean
  result: T
  error?: { code: string; message: string }
}

function instanceUrl(credentials: Credentials): string {
  return (credentials.extra?.['instanceUrl'] as string | undefined) ?? ''
}

function username(credentials: Credentials): string {
  return (credentials.extra?.['username'] as string | undefined) ?? ''
}

function accessKey(credentials: Credentials): string {
  // credentials.accessToken holds the Vtiger API key
  return credentials.accessToken
}

function sessionName(credentials: Credentials): string {
  return (credentials.extra?.['session'] as string | undefined) ?? ''
}

async function get<T>(base: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${base}/webservice.php`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Vtiger API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  const json = (await res.json()) as VtigerResponse<T>
  if (!json.success) {
    throw Object.assign(new Error(`Vtiger error: ${json.error?.message ?? 'unknown'}`), {
      code: json.error?.code,
    })
  }
  return json.result
}

async function post<T>(base: string, body: Record<string, string>): Promise<T> {
  const url = `${base}/webservice.php`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Vtiger API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  const json = (await res.json()) as VtigerResponse<T>
  if (!json.success) {
    const errCode = json.error?.code ?? ''
    throw Object.assign(new Error(`Vtiger error: ${json.error?.message ?? 'unknown'}`), {
      code: errCode,
    })
  }
  return json.result
}

export class VtigerClient {
  constructor(private credentials: Credentials) {}

  private base(): string {
    return instanceUrl(this.credentials)
  }

  /** Challenge-response login; returns a fresh session token. */
  async login(): Promise<string> {
    const base = this.base()
    const user = username(this.credentials)
    const key = accessKey(this.credentials)

    // Step 1: get challenge token
    const challenge = await get<{ token: string; serverTime: number }>(base, {
      operation: 'getchallenge',
      username: user,
    })

    // Step 2: compute MD5(token + accessKey) and login
    const md5Key = createHash('md5')
      .update(challenge.token + key)
      .digest('hex')
    // Documented response: "sessionName: String, // Unique Identifier for the
    // session (sessionId)", with userId, version and vtigerVersion.
    const result = await post<{
      sessionName: string
      userId: string
      version: string
      vtigerVersion: string
    }>(base, {
      operation: 'login',
      username: user,
      accessKey: md5Key,
    })

    return result.sessionName
  }

  /**
   * Execute a Vtiger query. Refreshes session on SESSION_EXPIRED and retries once.
   */
  async query<T>(soql: string): Promise<T[]> {
    const session = await this.ensureSession()
    try {
      return await get<T[]>(this.base(), {
        operation: 'query',
        sessionName: session,
        query: soql,
      })
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e?.code === 'SESSION_EXPIRED') {
        const newSession = await this.login()
        this.updateSession(newSession)
        return get<T[]>(this.base(), {
          operation: 'query',
          sessionName: newSession,
          query: soql,
        })
      }
      throw err
    }
  }

  async retrieve<T>(id: string): Promise<T> {
    const session = await this.ensureSession()
    return get<T>(this.base(), {
      operation: 'retrieve',
      sessionName: session,
      id,
    })
  }

  async create<T>(elementType: string, element: Record<string, unknown>): Promise<T> {
    const session = await this.ensureSession()
    return post<T>(this.base(), {
      operation: 'create',
      sessionName: session,
      elementType,
      element: JSON.stringify(element),
    })
  }

  async update<T>(element: Record<string, unknown>): Promise<T> {
    const session = await this.ensureSession()
    return post<T>(this.base(), {
      operation: 'update',
      sessionName: session,
      element: JSON.stringify(element),
    })
  }

  async deleteRecord(id: string): Promise<void> {
    const session = await this.ensureSession()
    await get<unknown>(this.base(), {
      operation: 'delete',
      sessionName: session,
      id,
    })
  }

  private async ensureSession(): Promise<string> {
    const existing = sessionName(this.credentials)
    if (existing) return existing
    const session = await this.login()
    this.updateSession(session)
    return session
  }

  private updateSession(session: string): void {
    if (!this.credentials.extra) {
      this.credentials = { ...this.credentials, extra: { session } }
    } else {
      ;(this.credentials.extra as Record<string, unknown>)['session'] = session
    }
  }
}
