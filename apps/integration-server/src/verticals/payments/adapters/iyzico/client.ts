/**
 * iyzico HTTP client.
 *
 * iyzico's payment API is RPC-style POST-only with no list/cursor endpoints.
 * The subscription v2 API and card-storage API use standard REST (GET/POST/DELETE)
 * but apply the same IYZWSv2 HMACSHA256 signature scheme — for GET requests the
 * body component of the signed string is an empty string "".
 *
 * Each request is authenticated with a v2 HMACSHA256 signature:
 *   randomKey  = a fresh random string per request
 *   signature  = hex( HMACSHA256(randomKey + uriPath + requestBody, secretKey) )
 *   auth       = base64("apiKey:" + apiKey + "&randomKey:" + randomKey + "&signature:" + signature)
 *   header     = "IYZWSv2 " + auth
 * with the same randomKey echoed in the `x-iyzi-rnd` header.
 *
 * Docs: https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth
 */
import { createHmac, randomBytes } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_SCHEME } from './constants'
import { apiKeyFor, baseUrlFor, secretKeyFor } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Generate a fresh random key for a single request. */
function randomKey(): string {
  return randomBytes(12).toString('hex')
}

/**
 * Build the `Authorization` header value (and the matching `x-iyzi-rnd`) for a
 * single POST. Exported so the signing logic is unit-testable in isolation.
 */
export function buildAuthHeader(
  apiKey: string,
  secretKey: string,
  uriPath: string,
  requestBody: string,
  rnd: string = randomKey(),
): { authorization: string; rnd: string } {
  const signature = createHmac('sha256', secretKey)
    .update(rnd + uriPath + requestBody)
    .digest('hex')
  const authorizationParams = `apiKey:${apiKey}&randomKey:${rnd}&signature:${signature}`
  const base64 = Buffer.from(authorizationParams, 'utf8').toString('base64')
  return { authorization: `${AUTH_SCHEME} ${base64}`, rnd }
}

export class IyzicoClient {
  private http: AxiosInstance
  private apiKey: string
  private secretKey: string

  constructor(credentials: Credentials) {
    this.apiKey = apiKeyFor(credentials)
    this.secretKey = secretKeyFor(credentials)
    this.http = axios.create({
      baseURL: baseUrlFor(credentials),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST a JSON body to `path`, signing it with the v2 HMACSHA256 scheme. The
   * body is serialized once so the exact bytes that are signed are the exact
   * bytes that are sent.
   */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const serialized = JSON.stringify(body)
    const { authorization, rnd } = buildAuthHeader(
      this.apiKey,
      this.secretKey,
      path,
      serialized,
    )
    return withRetry(async () => {
      const res = await this.http.post<T>(path, serialized, {
        headers: {
          Authorization: authorization,
          'x-iyzi-rnd': rnd,
        },
      })
      return res.data
    })
  }

  /**
   * GET `path` with optional query parameters, signed with the v2 HMACSHA256
   * scheme. For GET requests the body component of the signed string is "" (empty
   * string), matching iyzico's specification for the subscription v2 API.
   *
   * Docs: https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscriber-transactions
   */
  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const { authorization, rnd } = buildAuthHeader(this.apiKey, this.secretKey, path, '')
    return withRetry(async () => {
      const res = await this.http.get<T>(path, {
        params,
        headers: {
          Authorization: authorization,
          'x-iyzi-rnd': rnd,
        },
      })
      return res.data
    })
  }
}
