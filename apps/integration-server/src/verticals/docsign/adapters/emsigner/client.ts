/**
 * emSigner HTTP client.
 *
 * Auth (https://api.emsigner.com/swagger/docs/v1, `info.description`): an
 * AuthToken from POST /api/AuthorizeApp (body `AuthorizeAppRequest`
 * { AppName, SecretKey }, reply `ReturnObject[AuthorizeAppResp]` whose
 * `Response.AuthToken` is the token), passed "in header as basic
 * authentication", plus a `UserName` header holding the user's email. Every
 * data path declares the header parameter `Authorization` (required) and
 * `UserName` ("User EmailId"). The API itself answers a bare token with
 * "Invalid Authorization Scheme. Please use Basic.", so the header is
 * `Authorization: Basic <AuthToken>`.
 *
 * No emSigner doc states how long an AuthToken lives, nor how the API answers
 * one it no longer accepts. It is kept per connection. The live API answers a
 * request with no Basic scheme with HTTP 401, but a Basic token it does not
 * recognise with HTTP 500 and an empty body (probed 2026-09-24). So a data
 * call's first 401 or 5xx drops the cached token and the call is sent once
 * more with a fresh one; only that second send backs off and retries 5xx.
 *
 * Every reply is a `ReturnObject` { IsSuccess, Messages, ErrorCode, Response };
 * one with IsSuccess false is an error even when the HTTP status is 200.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { connectionScope, type Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import type { EmSignerReturnObject } from './types'

function isServerError(status: number | undefined): boolean {
  return status !== undefined && status >= 500 && status < 600
}

async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 4, serverErrors = true }: { retries?: number; serverErrors?: boolean } = {},
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (serverErrors && isServerError(status))) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** AuthTokens by connection. */
const tokens = new Map<string, Promise<string>>()

/** Exported for tests: the token cache is module-level. */
export function _resetEmSignerTokens(): void {
  tokens.clear()
}

function extraStr(credentials: Credentials, key: string): string {
  const v = credentials.extra?.[key]
  if (typeof v === 'string' && v !== '') return v
  throw new Error(`emsigner connection is missing ${key}`)
}

function unwrap<T>(body: EmSignerReturnObject<T>, what: string): T | undefined {
  if (!body || typeof body !== 'object' || body.IsSuccess !== true) {
    const messages = Array.isArray(body?.Messages) ? body.Messages.join('; ') : ''
    throw Object.assign(new Error(`emsigner ${what} failed${messages ? `: ${messages}` : ''}`), {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
      emsignerErrorCode: body?.ErrorCode,
    })
  }
  return body.Response
}

export class EmSignerClient {
  private readonly http: AxiosInstance
  private readonly appName: string
  private readonly userName: string
  private readonly secretKey: string
  /** Identifies this connection in the token cache and in pager keys. */
  readonly scope: string

  constructor(credentials: Credentials) {
    this.appName = extraStr(credentials, 'appName')
    this.userName = extraStr(credentials, 'userName')
    this.secretKey = credentials.accessToken
    if (!this.secretKey) throw new Error('emsigner connection is missing its SecretKey')
    this.scope = connectionScope(`emsigner:${this.appName}:${this.userName}`, credentials)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  private token(): Promise<string> {
    let hit = tokens.get(this.scope)
    if (!hit) {
      hit = withRetry(async () => {
        const { data } = await this.http.post<EmSignerReturnObject<{ AuthToken?: string }>>(
          '/api/AuthorizeApp',
          { AppName: this.appName, SecretKey: this.secretKey },
          { headers: { 'Content-Type': 'application/json' } },
        )
        const token = unwrap(data, 'AuthorizeApp')?.AuthToken
        if (typeof token !== 'string' || token === '') {
          throw new Error('emsigner AuthorizeApp returned no AuthToken')
        }
        return token
      })
      tokens.set(this.scope, hit)
      hit.catch(() => tokens.delete(this.scope))
    }
    return hit
  }

  private async send<T>(
    what: string,
    call: (headers: Record<string, string>) => Promise<{ data: EmSignerReturnObject<T> }>,
  ): Promise<T | undefined> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token()
      try {
        const { data } = await withRetry(
          () => call({ Authorization: `Basic ${token}`, UserName: this.userName }),
          { serverErrors: attempt > 0 },
        )
        return unwrap(data, what)
      } catch (err) {
        const status = (err as AxiosError).response?.status
        if (attempt === 0 && (status === 401 || isServerError(status))) {
          tokens.delete(this.scope)
          continue
        }
        throw err
      }
    }
  }

  async get<T>(path: string, params: Record<string, unknown>): Promise<T | undefined> {
    return this.send<T>(path, (headers) => this.http.get(path, { params, headers }))
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T | undefined> {
    return this.send<T>(path, (headers) =>
      this.http.post(path, body, { headers: { ...headers, 'Content-Type': 'application/json' } }),
    )
  }
}
