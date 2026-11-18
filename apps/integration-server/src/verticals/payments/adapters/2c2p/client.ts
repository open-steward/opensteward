import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type TwoC2PEnvironment } from './constants'
import { decodeJwtClaims, signJwtHs256, verifyJwtHs256 } from './jwt'

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

/** Envelope every 2C2P REST call uses: a single JWS in a `payload` field. */
interface JwtEnvelope {
  payload?: string
  respCode?: string
  respDesc?: string
}

/**
 * 2C2P Payment Gateway REST client.
 *
 * Auth is not a header token: each request body is `{ payload: <JWS> }` where
 * the JWS is HS256-signed with the merchant secret key, and `merchantID` is a
 * claim. The response is the same envelope — a JWS to be verified + decoded
 * back into claims. The client owns that sign / send / verify / decode cycle so
 * the adapter only deals in plain claim objects.
 *
 * 2C2P has no cursor/offset list pagination: Payment Inquiry is keyed by a
 * single `invoiceNo`, so the client is a thin signed-POST wrapper.
 */
export class TwoC2PClient {
  private http: AxiosInstance
  private secret: string
  private merchantId: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as TwoC2PEnvironment) ?? DEFAULT_ENVIRONMENT
    this.secret = credentials.accessToken ?? ''
    this.merchantId = String(extra.merchantId ?? '')
    this.http = axios.create({
      baseURL: HOSTS[env] ?? HOSTS[DEFAULT_ENVIRONMENT],
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Sign `claims` (with `merchantID` injected) into a JWS, POST the
   * `{ payload }` envelope, then verify + decode the response JWS into claims.
   * Throws if the response signature does not match the merchant secret.
   */
  async signedPost(path: string, claims: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = signJwtHs256({ merchantID: this.merchantId, ...claims }, this.secret)
    const res = await withRetry(async () =>
      (await this.http.post<JwtEnvelope>(path, { payload: token })).data,
    )
    const responseToken = res?.payload
    if (!responseToken) {
      // Some error envelopes omit the JWS and inline respCode/respDesc.
      if (res?.respCode) return { respCode: res.respCode, respDesc: res.respDesc }
      throw new Error('2C2P response missing payload')
    }
    if (!verifyJwtHs256(responseToken, this.secret)) {
      throw new Error('2C2P response JWS signature verification failed')
    }
    return decodeJwtClaims(responseToken)
  }
}
