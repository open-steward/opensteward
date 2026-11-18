/**
 * Peoplevox SOAP client.
 *
 * Handles session acquisition (Authenticate) and the primary read operation
 * (GetData) which returns CSV embedded in a SOAP Detail element.
 *
 * Session tokens are short-lived; the client acquires a fresh one per
 * PeoplevoxClient instance. Callers should not cache client instances
 * across long-lived request chains.
 */
import axios, { type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SOAP_HOST, SOAP_PATH_SUFFIX, SOAP_NAMESPACE } from './constants'

/** Parsed CSV rows keyed by header name. */
export type CsvRow = Record<string, string>

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1_000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Parse CSV text (first line = headers) into row objects. */
export function parseCsv(text: string): CsvRow[] {
  if (!text || !text.trim()) return []
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0]!.split(',').map((h) => h.trim())
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',')
    const row: CsvRow = {}
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim()
    })
    rows.push(row)
  }
  return rows
}

/** Extract the content of a named XML element (first occurrence, text only). */
function extractXmlText(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[^:>]+:)?${tag}>`)
  const m = xml.match(re)
  return m ? m[1]!.trim() : ''
}

export class PeoplevoxClient {
  private readonly clientId: string
  private readonly username: string
  private readonly password: string
  private readonly soapEndpoint: string

  /** Resolved lazily; key = `${userId}:${sessionId}` */
  private sessionId: string | null = null
  private userId = 0

  constructor(credentials: Credentials) {
    const clientId = String(credentials.extra?.['clientId'] ?? '')
    const username = String(credentials.extra?.['username'] ?? '')
    const password = String(credentials.extra?.['password'] ?? '')
    if (!clientId || !username || !password) {
      throw new Error('peoplevox requires credentials.extra: clientId, username, password')
    }
    this.clientId = clientId
    this.username = username
    this.password = password
    this.soapEndpoint = `${SOAP_HOST}/${clientId}${SOAP_PATH_SUFFIX}`
  }

  private buildSoapEnvelope(headerXml: string, bodyXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:ns="${SOAP_NAMESPACE}">
  <soap12:Header>
    ${headerXml}
  </soap12:Header>
  <soap12:Body>
    ${bodyXml}
  </soap12:Body>
</soap12:Envelope>`
  }

  private async authenticate(): Promise<void> {
    const b64pw = Buffer.from(this.password).toString('base64')
    const body = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:ns="${SOAP_NAMESPACE}">
  <soap12:Body>
    <ns:Authenticate>
      <ns:clientId>${this.clientId}</ns:clientId>
      <ns:username>${this.username}</ns:username>
      <ns:password>${b64pw}</ns:password>
    </ns:Authenticate>
  </soap12:Body>
</soap12:Envelope>`

    const { data } = await withRetry(() =>
      axios.post<string>(this.soapEndpoint, body, {
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          SOAPAction: `${SOAP_NAMESPACE}Authenticate`,
        },
        timeout: 30_000,
        responseType: 'text',
      }),
    )

    // Detail contains "clientId,sessionUuid"
    const detail = extractXmlText(data, 'Detail')
    const parts = detail.split(',')
    if (parts.length < 2 || !parts[1]) {
      throw new Error(`peoplevox Authenticate failed — Detail: ${detail}`)
    }
    this.sessionId = parts[1].trim()
    this.userId = 0 // Peoplevox UserId in session credentials is 0 by convention
  }

  private sessionCredentialsXml(): string {
    return `<ns:UserSessionCredentials>
      <ns:UserId>${this.userId}</ns:UserId>
      <ns:ClientId>${this.clientId}</ns:ClientId>
      <ns:SessionId>${this.sessionId}</ns:SessionId>
    </ns:UserSessionCredentials>`
  }

  /**
   * Call GetData for a given template, returning parsed CSV rows.
   * Paginates via pageNo (1-based).
   */
  async getData(templateName: string, pageNo: number, itemsPerPage: number, searchClause = ''): Promise<{ rows: CsvRow[]; totalCount: number }> {
    if (!this.sessionId) await this.authenticate()

    const bodyXml = `<ns:GetData>
      <ns:getRequest>
        <ns:TemplateName>${templateName}</ns:TemplateName>
        <ns:PageNo>${pageNo}</ns:PageNo>
        <ns:ItemsPerPage>${itemsPerPage}</ns:ItemsPerPage>
        <ns:SearchClause>${searchClause}</ns:SearchClause>
      </ns:getRequest>
    </ns:GetData>`

    const envelope = this.buildSoapEnvelope(this.sessionCredentialsXml(), bodyXml)

    const { data } = await withRetry(() =>
      axios.post<string>(this.soapEndpoint, envelope, {
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          SOAPAction: `${SOAP_NAMESPACE}GetData`,
        },
        timeout: 60_000,
        responseType: 'text',
      }),
    )

    const totalCountStr = extractXmlText(data, 'TotalCount')
    const totalCount = totalCountStr ? parseInt(totalCountStr, 10) || 0 : 0
    const detail = extractXmlText(data, 'Detail')
    const rows = parseCsv(detail)
    return { rows, totalCount }
  }
}
