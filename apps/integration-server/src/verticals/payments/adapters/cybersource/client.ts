import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash, createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type CybersourceEnvironment } from './constants'

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

function digestSha256Base64(body: string): string {
  return 'SHA-256=' + createHash('sha256').update(body, 'utf8').digest('base64')
}

function signatureHeader(opts: {
  keyId: string
  secret: string
  method: string
  path: string
  host: string
  date: string
  digest: string | null
  merchantId: string
}): string {
  const headers = [
    `host: ${opts.host}`,
    `date: ${opts.date}`,
    `(request-target): ${opts.method.toLowerCase()} ${opts.path}`,
  ]
  const signHeaders = ['host', 'date', '(request-target)']
  if (opts.digest) {
    headers.push(`digest: ${opts.digest}`)
    signHeaders.push('digest')
  }
  headers.push(`v-c-merchant-id: ${opts.merchantId}`)
  signHeaders.push('v-c-merchant-id')

  const signingString = headers.join('\n')
  const sig = createHmac('sha256', Buffer.from(opts.secret, 'base64'))
    .update(signingString, 'utf8')
    .digest('base64')

  return [
    `keyid="${opts.keyId}"`,
    `algorithm="HmacSHA256"`,
    `headers="${signHeaders.join(' ')}"`,
    `signature="${sig}"`,
  ].join(', ')
}

export class CybersourceClient {
  private http: AxiosInstance
  private host: string
  private merchantId: string
  private keyId: string
  private secret: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as CybersourceEnvironment) ?? DEFAULT_ENVIRONMENT
    this.host = HOSTS[env].replace(/^https?:\/\//, '')
    this.merchantId = String(extra.merchantId ?? '')
    this.keyId = String(extra.keyId ?? '')
    this.secret = credentials.accessToken
    this.http = axios.create({ baseURL: HOSTS[env], timeout: 30_000 })
  }

  private buildHeaders(method: string, path: string, body?: string): Record<string, string> {
    const date = new Date().toUTCString()
    const digest = body ? digestSha256Base64(body) : null
    const signature = signatureHeader({
      keyId: this.keyId,
      secret: this.secret,
      method,
      path,
      host: this.host,
      date,
      digest,
      merchantId: this.merchantId,
    })
    const headers: Record<string, string> = {
      Accept: 'application/hal+json',
      'V-C-Merchant-Id': this.merchantId,
      Date: date,
      Host: this.host,
      Signature: signature,
    }
    if (digest) {
      headers.Digest = digest
      headers['Content-Type'] = 'application/json'
    }
    return headers
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const headers = this.buildHeaders('GET', path)
      const { data } = await this.http.get<T>(path, { headers })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const bodyJson = JSON.stringify(body ?? {})
      const headers = this.buildHeaders('POST', path, bodyJson)
      const { data } = await this.http.post<T>(path, bodyJson, { headers })
      return data
    })
  }
}
