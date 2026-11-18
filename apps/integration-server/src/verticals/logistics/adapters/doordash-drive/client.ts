import axios, { type AxiosInstance } from 'axios'
import { DOORDASH_DRIVE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

const JWT_TTL_MS = 25 * 60 * 1000 // 25 minutes (5-min safety buffer before 30-min exp)

export class DoordashDriveClient {
  private http: AxiosInstance
  private developerId: string
  private keyId: string
  private signingSecret: string
  private cachedJwt: { token: string; expiresAt: number } | null = null

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const developerId = extra.developerId as string | undefined
    const keyId = extra.keyId as string | undefined
    const signingSecret = extra.signingSecret as string | undefined
    if (!developerId || !keyId || !signingSecret) {
      throw new Error(
        'DoorDash Drive client requires developerId, keyId, and signingSecret in credentials.extra',
      )
    }
    this.developerId = developerId
    this.keyId = keyId
    this.signingSecret = signingSecret
    this.http = axios.create({
      baseURL: DOORDASH_DRIVE_API_BASE,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  }

  private async signJwt(): Promise<string> {
    if (this.cachedJwt && this.cachedJwt.expiresAt > Date.now()) {
      return this.cachedJwt.token
    }
    const secret = Buffer.from(this.signingSecret, 'base64')
    const { SignJWT } = await import('jose')
    const jwt = await new SignJWT({ aud: 'doordash', iss: this.developerId })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'JWT',
        'dd-ver': 'DD-JWT-V1',
        kid: this.keyId,
      } as unknown as Parameters<typeof SignJWT.prototype.setProtectedHeader>[0])
      .setIssuedAt()
      .setExpirationTime('30m')
      .sign(secret)
    this.cachedJwt = { token: jwt, expiresAt: Date.now() + JWT_TTL_MS }
    return jwt
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const token = await this.signJwt()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.signJwt()
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    const token = await this.signJwt()
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }
}
