/**
 * SaldeoSMART HTTP client.
 *
 * Auth model: every GET request carries three query parameters:
 *   - username  – the Saldeo account username
 *   - req_id    – monotonic request ID (UTC timestamp yyyyMMddHHmmss)
 *   - req_sig   – MD5 hex-digest of:
 *                   URL-encoded sorted(all-params) + api_token (appended raw)
 *
 * Base URL: https://api.saldeosmart.pl/api/xml/1.0
 * Responses: XML; parsed via a dependency-free regex approach.
 *
 * SaldeoSMART does not paginate responses at the API level — the full
 * result set for the requested policy/company is returned in one call.
 */

import { createHash } from 'node:crypto'
import axios from 'axios'
import { SALDEO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

// ── Credential helpers ─────────────────────────────────────────────────────────

/** Split the packed accessToken "username|api_token" back into parts. */
export function unpackToken(accessToken: string): { username: string; apiToken: string } {
  const idx = accessToken.indexOf('|')
  if (idx === -1) {
    throw new Error('SaldeoSMART: malformed accessToken — expected "username|api_token"')
  }
  return {
    username: accessToken.slice(0, idx),
    apiToken: accessToken.slice(idx + 1),
  }
}

// ── Request-signature helpers ──────────────────────────────────────────────────

/** Generate a timestamp-based request ID (yyyyMMddHHmmss). */
function makeReqId(): string {
  const now = new Date()
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('')
}

/**
 * Compute req_sig:
 *   1. Build a flat Record<string,string> of all query params including
 *      username and req_id (but NOT api_token — never sent over the wire).
 *   2. Sort keys alphabetically.
 *   3. URL-encode each key=value and join with &.
 *   4. Append raw api_token (no separator, no encoding).
 *   5. Return MD5 hex digest (lowercase).
 */
function computeReqSig(params: Record<string, string>, apiToken: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] ?? '')}`)
    .join('&')
  const base = sorted + apiToken
  return createHash('md5').update(base, 'utf8').digest('hex')
}

// ── Minimal XML parsing ────────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Return inner text of first <tag>…</tag> occurrence, or undefined. */
export function xmlTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  if (!m) return undefined
  const v = decodeXmlEntities(m[1] ?? '').trim()
  return v === '' ? undefined : v
}

/** Return all <tag>…</tag> blocks (with wrapper) found in xml. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
  return xml.match(re) ?? []
}

/** Verify the response STATUS is OK; throw on ERROR. */
function checkStatus(xml: string): void {
  const status = xmlTag(xml, 'STATUS')
  if (status && status !== 'OK') {
    const code = xmlTag(xml, 'ERROR_CODE') ?? 'UNKNOWN'
    const msg = xmlTag(xml, 'ERROR_MESSAGE') ?? 'Unknown SaldeoSMART error'
    throw new Error(`SaldeoSMART API error [${code}]: ${msg}`)
  }
}

// ── Client ─────────────────────────────────────────────────────────────────────

export class SaldeoClient {
  private username: string
  private apiToken: string

  constructor(credentials: Credentials) {
    const { username, apiToken } = unpackToken(credentials.accessToken)
    this.username = username
    this.apiToken = apiToken
  }

  /**
   * GET request to a SaldeoSMART endpoint.
   *
   * @param path   Path relative to SALDEO_API_BASE, e.g. "company/list"
   * @param extra  Extra query parameters (e.g. company_program_id, policy)
   * @returns raw XML string of the RESPONSE body
   */
  async get(path: string, extra: Record<string, string> = {}): Promise<string> {
    return withRetry(async () => {
      const reqId = makeReqId()
      const params: Record<string, string> = {
        username: this.username,
        req_id: reqId,
        ...extra,
      }
      params['req_sig'] = computeReqSig(params, this.apiToken)

      const url = `${SALDEO_API_BASE}/${path}`
      const { data: rawXml } = await axios.get<string>(url, {
        params,
        headers: { Accept: 'application/xml, text/xml' },
        responseType: 'text',
      })

      checkStatus(rawXml)
      return rawXml
    })
  }

  /**
   * POST request (e.g. contractor.merge, document.add).
   *
   * @param path   Path relative to SALDEO_API_BASE
   * @param extra  Extra query parameters (company_program_id etc.)
   * @param body   Raw XML string to send as the "command" form field
   * @returns raw XML string of the RESPONSE body
   */
  async post(path: string, extra: Record<string, string> = {}, body?: string): Promise<string> {
    return withRetry(async () => {
      const reqId = makeReqId()
      const params: Record<string, string> = {
        username: this.username,
        req_id: reqId,
        ...extra,
      }
      params['req_sig'] = computeReqSig(params, this.apiToken)

      const formData = new URLSearchParams(params)
      if (body) formData.set('command', body)

      const url = `${SALDEO_API_BASE}/${path}`
      const { data: rawXml } = await axios.post<string>(url, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/xml, text/xml',
        },
        responseType: 'text',
      })

      checkStatus(rawXml)
      return rawXml
    })
  }
}
