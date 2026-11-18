import axios from 'axios'
import { createHash } from 'crypto'
import { withRetry as withRetryBase } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import {
  IMILE_API_BASE,
  IMILE_FORMAT,
  IMILE_SIGN_METHOD,
  IMILE_TIME_ZONE,
  IMILE_VERSION,
} from './constants'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/** The per-connection inputs iMile issues: "Customer ID and the Sign Key". */
export interface IMileSigningKeys {
  customerId: string
  signKey: string
}

/**
 * Every iMile response body. Introduction
 * (https://developer.imile.com/apis/details/1825830683510648833): "If the API
 * successfully processes a request, the HTTP response status code will always
 * be 200 OK"; the outcome is `code` ("200" = "Processed successfully").
 */
export interface IMileResponse<T> {
  code?: string | number | null
  message?: string | null
  traceId?: string | null
  timeZone?: string | null
  data?: T | null
}

export class IMileApiError extends Error {
  readonly code = 'IMILE_API_ERROR'
  constructor(
    readonly imileCode: string,
    message: string,
    readonly traceId?: string,
  ) {
    super(message)
    this.name = 'IMileApiError'
  }
}

/**
 * The documented signature ("Signature rules and request message
 * concatenation example",
 * https://developer.imile.com/apis/details/1826162720868216833):
 *   ① "Sort the keys of the above public necessary parameters ... in
 *      ascending order of the ASCII code of the alphabet (excluding param)"
 *   ② "Splice the sorted parameter names and parameter values, and add
 *      secretKey at the beginning and end":
 *      secretKeyaccessTokenxxxxcustomerIdxxxx...versionxxxxbodysecretKey,
 *      "body is replaced by the param value data in the request"
 *   ③ "Encrypt the concatenated string using MD5 and convert it to uppercase"
 */
export function buildSign(
  publicParams: Record<string, string>,
  paramJson: string,
  signKey: string,
): string {
  const spliced = Object.keys(publicParams)
    .sort()
    .map((k) => `${k}${publicParams[k]}`)
    .join('')
  return createHash('md5')
    .update(`${signKey}${spliced}${paramJson}${signKey}`, 'utf8')
    .digest('hex')
    .toUpperCase()
}

/**
 * The request envelope of the documents' examples: the public parameters,
 * `sign`, and the business payload as the `param` object. accessToken is
 * omitted for the token grant ("There is no need to splice the accessToken
 * field and value when calling the get token interface").
 */
export function buildEnvelope(
  keys: IMileSigningKeys,
  accessToken: string | undefined,
  param: unknown,
): Record<string, unknown> {
  const publicParams: Record<string, string> = {
    customerId: keys.customerId,
    format: IMILE_FORMAT,
    signMethod: IMILE_SIGN_METHOD,
    timeZone: IMILE_TIME_ZONE,
    timestamp: String(Date.now()),
    version: IMILE_VERSION,
  }
  if (accessToken !== undefined) publicParams.accessToken = accessToken
  const payload = param ?? {}
  // The signed body is the same JSON axios sends for `param`.
  const sign = buildSign(publicParams, JSON.stringify(payload), keys.signKey)
  return { ...publicParams, param: payload, sign }
}

/** POST a signed envelope; resolve with the response body when `code` is "200". */
export async function signedPost<T>(
  path: string,
  keys: IMileSigningKeys,
  accessToken: string | undefined,
  param: unknown,
): Promise<IMileResponse<T>> {
  const http = axios.create({
    baseURL: `${IMILE_API_BASE}/`,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  const envelope = buildEnvelope(keys, accessToken, param)
  const body = await withRetry(async () => {
    const { data } = await http.post<IMileResponse<T>>(path, envelope)
    return data
  })
  const code = String(body?.code ?? '')
  if (code !== '200') {
    throw new IMileApiError(
      code,
      `iMile ${path} failed: code ${code || '(none)'}: ${body?.message ?? 'no message'}`,
      body?.traceId ?? undefined,
    )
  }
  return body
}

/** Read the grant inputs a connection stored at exchangeCredentials time. */
export function signingKeys(credentials: Credentials): IMileSigningKeys | undefined {
  const extra = credentials.extra ?? {}
  const customerId = extra['customerId']
  const signKey = extra['signKey']
  if (typeof customerId !== 'string' || !customerId) return undefined
  if (typeof signKey !== 'string' || !signKey) return undefined
  return { customerId, signKey }
}

export const RECONNECT_MESSAGE =
  'This iMile connection has no stored Customer ID and Sign Key; reconnect it through the credential form'

/** A client bound to one connection's access token and signing keys. */
export class IMileClient {
  private readonly keys: IMileSigningKeys
  private readonly accessToken: string

  constructor(credentials: Credentials) {
    const keys = signingKeys(credentials)
    if (!keys) throw new Error(RECONNECT_MESSAGE)
    this.keys = keys
    this.accessToken = credentials.accessToken
  }

  post<T>(path: string, param: unknown): Promise<IMileResponse<T>> {
    return signedPost<T>(path, this.keys, this.accessToken, param)
  }
}
