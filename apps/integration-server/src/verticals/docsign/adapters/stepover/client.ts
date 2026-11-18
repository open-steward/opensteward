/**
 * StepOver webSignatureOffice "Tyr" web-service client.
 *
 * The Tyr service is XML-RPC over HTTP POST. Every method is namespaced
 * `tyrservice.*`. Auth is a session: `tyrservice.login(username, password)`
 * returns a session id that is the first argument of every other method.
 * Each request body is additionally SHA-1-hashed together with the
 * customer's signing key and the digest is sent in the `X-SOSIGNATURE`
 * header.
 *
 * Responses always return HTTP 200; failures arrive as an XML-RPC `<fault>`
 * carrying a StepOver error code (100-124, e.g. 102 = login failed). This
 * client builds the request envelope and parses the small scalar responses
 * the docsign resources need (string session id, int status, boolean) with a
 * dependency-free reader — the only response shapes the adapter consumes.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, REQUEST_SIGNATURE_HEADER } from './constants'

export type XmlRpcParam = string | number | boolean

export class TyrFaultError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`StepOver Tyr fault ${code}: ${message}`)
    this.name = 'TyrFaultError'
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function serializeParam(param: XmlRpcParam): string {
  if (typeof param === 'boolean') return `<value><boolean>${param ? 1 : 0}</boolean></value>`
  if (typeof param === 'number') {
    return Number.isInteger(param)
      ? `<value><int>${param}</int></value>`
      : `<value><double>${param}</double></value>`
  }
  return `<value><string>${escapeXml(param)}</string></value>`
}

function buildRequest(method: string, params: XmlRpcParam[]): string {
  const body = params.map((p) => `<param>${serializeParam(p)}</param>`).join('')
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${body}</params></methodCall>`
}

/** Extract the inner text of the first `<tag>…</tag>` match, or undefined. */
function firstTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1] : undefined
}

/** Read the scalar value of an XML-RPC `<methodResponse>`, throwing on `<fault>`. */
function parseScalarResponse(xml: string): string {
  const fault = firstTag(xml, 'fault')
  if (fault !== undefined) {
    const code = Number(firstTag(fault, 'int') ?? firstTag(fault, 'i4') ?? '0')
    const message = unescapeXml(firstTag(fault, 'string') ?? 'request failed')
    throw new TyrFaultError(code, message)
  }
  // <params><param><value><TYPE>…</TYPE></value></param></params>
  const valueBlock = firstTag(xml, 'value') ?? ''
  const typed =
    firstTag(valueBlock, 'string') ??
    firstTag(valueBlock, 'int') ??
    firstTag(valueBlock, 'i4') ??
    firstTag(valueBlock, 'boolean')
  // A bare <value>text</value> with no inner type tag is a string per spec.
  const raw = typed ?? valueBlock
  return unescapeXml(raw.trim())
}

export class StepoverClient {
  private http: AxiosInstance
  private signingKey: string
  private username: string
  private password: string
  private sessionId?: string

  constructor(credentials: Credentials) {
    const extra = credentials.extra ?? {}
    const baseURL = String(extra['baseUrl'] ?? API_BASE_URL)
    this.signingKey = String(extra['signingKey'] ?? '')
    this.username = String(extra['username'] ?? credentials.accessToken ?? '')
    this.password = String(extra['password'] ?? '')
    this.http = axios.create({
      baseURL,
      headers: { 'Content-Type': 'text/xml', Accept: 'text/xml' },
      timeout: 30_000,
    })
  }

  /** POST one XML-RPC call and return its scalar result as a string. */
  private async rawCall(method: string, params: XmlRpcParam[]): Promise<string> {
    const requestBody = buildRequest(method, params)
    const signature = createHash('sha1').update(`${requestBody}${this.signingKey}`).digest('hex')
    return withRetry(async () => {
      const { data } = await this.http.post<string>('', requestBody, {
        headers: { [REQUEST_SIGNATURE_HEADER]: signature },
        responseType: 'text',
      })
      return parseScalarResponse(typeof data === 'string' ? data : String(data))
    })
  }

  /** Resolve (and cache) a session id via `tyrservice.login`. */
  private async session(): Promise<string> {
    if (this.sessionId) return this.sessionId
    const id = await this.rawCall('tyrservice.login', [this.username, this.password])
    this.sessionId = id
    return id
  }

  /** Call a session-scoped `tyrservice.*` method, returning the raw scalar string. */
  async call(method: string, params: XmlRpcParam[]): Promise<string> {
    const sessionId = await this.session()
    return this.rawCall(method, [sessionId, ...params])
  }

  /** Convenience: call a method whose scalar result is an integer. */
  async callInt(method: string, params: XmlRpcParam[]): Promise<number> {
    const value = await this.call(method, params)
    return Number(value)
  }

  /** Convenience: call a method whose scalar result is a boolean. */
  async callBool(method: string, params: XmlRpcParam[]): Promise<boolean> {
    const value = await this.call(method, params)
    return value === '1' || value.toLowerCase() === 'true'
  }
}
