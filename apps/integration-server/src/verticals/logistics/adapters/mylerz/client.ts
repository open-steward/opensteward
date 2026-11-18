import axios, { type AxiosInstance } from 'axios'
import { MYLERZ_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
import { requestToken, storedLogin } from './auth'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Every integration.mylerz.net/Help response is a `DescriptiveResponseOf...`
 * envelope: "Value", "CoreValue", "IsErrorState", "ErrorDescription",
 * "ErrorMetadata".
 */
export interface MylerzDescriptive<T> {
  Value?: T | null
  CoreValue?: string | null
  IsErrorState?: boolean | null
  ErrorDescription?: string | null
  ErrorMetadata?: unknown
}

/**
 * A bearer token lapses after a lifetime Mylerz does not document, and the
 * /token response the plugin reads carries only `access_token`, so there is
 * no `expiresAt` for the shared TokenRefresher to act on. The client does what
 * the official WooCommerce plugin does when a token is refused: request a new
 * one from the stored username and password (includes/mylerz-ajax.php:
 * `$response = mylerzRequestNewToken(esc_url($mylerz_integration_api . '/token'));`)
 * and send the call again, once.
 */
function isUnauthorized(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401
}

export class MylerzClient {
  private http: AxiosInstance

  constructor(private credentials: Credentials) {
    this.http = MylerzClient.build(credentials.accessToken)
  }

  private static build(token: string): AxiosInstance {
    return axios.create({
      baseURL: MYLERZ_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Official Mylerz WooCommerce plugin, includes/mylerz-helpers.php:
        // 'Authorization' => 'bearer ' . $token
        Authorization: `bearer ${token}`,
      },
    })
  }

  private async send<T>(fn: (http: AxiosInstance) => Promise<T>): Promise<T> {
    try {
      return await withRetry(() => fn(this.http))
    } catch (err) {
      const login = storedLogin(this.credentials)
      if (!isUnauthorized(err) || !login) throw err
      const fresh = await requestToken(login.username, login.password)
      this.credentials = fresh
      this.http = MylerzClient.build(fresh.accessToken)
      return withRetry(() => fn(this.http))
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.send(async (http) => (await http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return this.send(async (http) => (await http.post<T>(path, body, { params })).data)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.send(async (http) => (await http.put<T>(path, body)).data)
  }

  async delete(path: string): Promise<void> {
    await this.send(async (http) => {
      await http.delete(path)
    })
  }
}

/**
 * The envelope's Value, or the platform's own error. The plugin reads it the
 * same way: `if ($result->IsErrorState === TRUE) { ... $result->ErrorDescription }
 * else { ... $result->Value }`.
 */
export function unwrapDescriptive<T>(
  path: string,
  res: MylerzDescriptive<T>,
): T | null | undefined {
  if (res.IsErrorState === true) {
    throw Object.assign(
      new Error(`Mylerz ${path} failed: ${res.ErrorDescription ?? 'IsErrorState'}`),
      { statusCode: 502 },
    )
  }
  return res.Value
}
