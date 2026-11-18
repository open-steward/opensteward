/**
 * OTOBO Generic Interface REST client.
 *
 * Base URL: {serverUrl}/otobo/nph-genericinterface.pl/Webservice/{websvcName}
 * (bin/psgi-bin/otobo.psgi mounts '/nph-genericinterface.pl' under '/otobo';
 * Transport/HTTP/REST.pm strips `.*Webservice(?:ID)?/[^/]+` and routes the
 * rest through the web service's RouteOperationMapping).
 *
 * Auth: UserLogin + Password, sent as query parameters on GET (REST.pm:
 * "e.g. from /Ticket/1/2?UserLogin=user&Password=secret"); query parameters
 * are merged into the operation's Data, which Operation::Common::Auth reads.
 *
 * Errors: an operation that fails returns HTTP 200 with
 *   { "Error": { "ErrorCode": "...", "ErrorMessage": "..." } }
 * (Operation::Common::ReturnError sets Success => 1), so the body has to be
 * checked, or an auth failure reads as an empty result.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_WEBSERVICE_NAME } from './constants'

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

interface OtoboErrorBody {
  Error?: { ErrorCode?: string; ErrorMessage?: string }
}

/**
 * HTTP status for the operation error codes TicketSearch.pm / TicketGet.pm
 * return: `<Operation>.AuthFail`, `TicketGet.AccessDenied`,
 * `TicketGet.NotValidTicketID`. Anything else is an upstream failure.
 */
function statusForErrorCode(code: string): number {
  if (code.endsWith('.AuthFail')) return 401
  if (code.endsWith('.AccessDenied')) return 403
  if (code.endsWith('.NotValidTicketID')) return 404
  return 502
}

export function throwIfOtoboError(data: unknown): void {
  const error = (data as OtoboErrorBody | null | undefined)?.Error
  if (!error || typeof error !== 'object') return
  const code = String(error.ErrorCode ?? 'Unknown')
  throw Object.assign(new Error(`OTOBO ${code}: ${String(error.ErrorMessage ?? '')}`), {
    statusCode: statusForErrorCode(code),
    code,
  })
}

export class OtoboClient {
  private http: AxiosInstance
  private userLogin: string
  private password: string

  constructor(credentials: Credentials) {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '')
    const websvcName = String(credentials.extra?.['websvcName'] ?? DEFAULT_WEBSERVICE_NAME)
    this.userLogin = credentials.accessToken
    this.password = String(credentials.extra?.['password'] ?? '')

    const baseURL = `${serverUrl.replace(/\/+$/, '')}/otobo/nph-genericinterface.pl/Webservice/${encodeURIComponent(websvcName)}`

    this.http = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET request — auth params appended to query string.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: {
          UserLogin: this.userLogin,
          Password: this.password,
          ...params,
        },
      })
      throwIfOtoboError(data)
      return data
    })
  }

  /**
   * POST request — auth fields merged into JSON body.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, {
        UserLogin: this.userLogin,
        Password: this.password,
        ...body,
      })
      throwIfOtoboError(data)
      return data
    })
  }
}
