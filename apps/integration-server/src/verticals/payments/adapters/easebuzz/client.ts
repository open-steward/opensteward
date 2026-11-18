/**
 * Easebuzz server-to-server client.
 *
 * Easebuzz has no token auth: each call POSTs a form-encoded body to the
 * dashboard host carrying the merchant `key` and a per-request SHA-512 `hash`.
 * The hash is the pipe-joined values of an ordered, API-specific field
 * sequence with the merchant `salt` appended last — empty fields still emit
 * their pipe separator so the digest matches Easebuzz's side exactly.
 *
 * There is no pagination: the post-payment APIs address a single transaction
 * or refund by id, so the client only needs a signed POST.
 *
 * Docs: https://docs.easebuzz.in/docs/payment-gateway
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { dashboardBaseUrl } from './constants'
import { merchantKey, merchantSalt, environment } from './auth'

/**
 * Ordered hash sequences per API. Mirrors the official PHP library: the values
 * of these fields are joined with `|`, the salt is appended, and the lowercase
 * SHA-512 hex digest is the `hash`.
 */
export const HASH_SEQUENCES = {
  transaction: ['key', 'txnid'],
  refund: ['key', 'merchant_refund_id', 'easebuzz_id', 'refund_amount'],
  refund_status: ['key', 'easebuzz_id'],
} as const

export type EasebuzzApi = keyof typeof HASH_SEQUENCES

/** Build the lowercase SHA-512 request hash for the given API + params. */
export function buildRequestHash(
  api: EasebuzzApi,
  params: Record<string, string>,
  salt: string,
): string {
  const sequence = HASH_SEQUENCES[api]
  let hashString = ''
  for (const field of sequence) {
    hashString += params[field] ?? ''
    hashString += '|'
  }
  hashString += salt
  return createHash('sha512').update(hashString).digest('hex').toLowerCase()
}

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

/** Generic Easebuzz response envelope: `{ status, data }`. */
export interface EasebuzzEnvelope<T> {
  status?: number | boolean
  data?: T
  msg?: string
  message?: string
  error?: string
  error_desc?: string
}

export class EasebuzzClient {
  private http: AxiosInstance
  private salt: string
  private key: string

  constructor(credentials: Credentials) {
    this.key = merchantKey(credentials)
    this.salt = merchantSalt(credentials)
    this.http = axios.create({
      baseURL: dashboardBaseUrl(environment(credentials)),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Sign and POST a request to a dashboard API. `fields` are the request
   * params (without `key`/`hash`); the client injects the merchant key, signs
   * with the API-specific sequence, drops empty params, and form-encodes.
   */
  async signedPost<T>(
    api: EasebuzzApi,
    path: string,
    fields: Record<string, string>,
  ): Promise<EasebuzzEnvelope<T>> {
    const withKey: Record<string, string> = { ...fields, key: this.key }
    const hash = buildRequestHash(api, withKey, this.salt)
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(withKey)) {
      if (v !== '' && v != null) body.set(k, v)
    }
    body.set('hash', hash)
    return withRetry(
      async () => (await this.http.post<EasebuzzEnvelope<T>>(path, body.toString())).data,
    )
  }
}
