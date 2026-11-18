/**
 * YukiSoapClient — thin SOAP-over-HTTP wrapper for the Yuki API.
 *
 * Yuki uses SOAP for all operations. Each request follows this pattern:
 *   1. Call Authenticate(accessKey) on the target .asmx endpoint → sessionID
 *   2. Call the desired SOAP method with (sessionID, administrationId, ...)
 *
 * The credentials object carries:
 *   accessToken  = WebserviceAccessKey
 *   tenantId     = AdministrationID
 *
 * Sessions are short-lived and not persisted — we obtain a fresh sessionID
 * for every call batch (one Authenticate per YukiSoapClient instance).
 */

import axios from 'axios'
import { withRetry } from '@opensteward/shared'
import { YUKI_API_BASE, YUKI_SOAP_NS } from './constants'
import type { Credentials } from '../../adapter/interface'

// ── XML helpers ──────────────────────────────────────────────────────────────

function escapeXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function soapEnvelope(method: string, bodyInner: string, ns = YUKI_SOAP_NS): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="${ns}">
  <soap:Body>
    <tns:${method}>
${bodyInner}
    </tns:${method}>
  </soap:Body>
</soap:Envelope>`
}

function extractText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml)
  return m ? m[1].trim() : ''
}

// ── Per-service client ────────────────────────────────────────────────────────

type YukiService = 'Sales' | 'Accounting' | 'AccountingInfo' | 'Contact'

export class YukiSoapClient {
  private readonly accessKey: string
  readonly administrationId: string
  private sessionId: string | null = null

  constructor(credentials: Credentials) {
    this.accessKey = credentials.accessToken
    // The Connect Link form stores the administration in extra; `tenantId` is
    // where the legacy exchangeCode("key:administrationId") put it.
    const stored = credentials.extra?.['administrationId']
    this.administrationId = (typeof stored === 'string' && stored) || credentials.tenantId || ''
    if (!this.administrationId) {
      throw new Error(
        'Yuki connection is missing its Administration ID; reconnect it and enter the Administration ID.',
      )
    }
  }

  private serviceUrl(service: YukiService): string {
    return `${YUKI_API_BASE}/${service}.asmx`
  }

  private async soapPost(service: YukiService, envelope: string, action: string): Promise<string> {
    return withRetry(async () => {
      const url = this.serviceUrl(service)
      const { data } = await axios.post<string>(url, envelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${YUKI_SOAP_NS}${action}"`,
        },
      })
      return data as string
    })
  }

  /** Authenticate once and cache the sessionID for this instance */
  private async getSessionId(service: YukiService): Promise<string> {
    if (this.sessionId) return this.sessionId
    const envelope = soapEnvelope(
      'Authenticate',
      `      <tns:accessKey>${escapeXml(this.accessKey)}</tns:accessKey>`,
    )
    const xml = await this.soapPost(service, envelope, 'Authenticate')
    const sessionId = extractText(xml, 'AuthenticateResult')
    if (!sessionId) {
      throw new Error('Yuki: Authenticate returned no sessionID — check the WebserviceAccessKey')
    }
    this.sessionId = sessionId
    return sessionId
  }

  // ── Sales ─────────────────────────────────────────────────────────────────

  async processSalesInvoices(xmlDoc: string): Promise<string> {
    const sessionId = await this.getSessionId('Sales')
    const envelope = soapEnvelope(
      'ProcessSalesInvoices',
      `      <tns:sessionId>${escapeXml(sessionId)}</tns:sessionId>
      <tns:administrationId>${escapeXml(this.administrationId)}</tns:administrationId>
      <tns:xmlDoc><![CDATA[${xmlDoc}]]></tns:xmlDoc>`,
    )
    return this.soapPost('Sales', envelope, 'ProcessSalesInvoices')
  }

  // ── Contact ───────────────────────────────────────────────────────────────

  async searchContacts(opts: {
    searchOption?: string
    searchValue?: string
    sortOrder?: string
    modifiedAfter?: string
    active?: string
    pageNumber?: number
  }): Promise<string> {
    const sessionId = await this.getSessionId('Contact')
    const {
      searchOption = 'All',
      searchValue = '',
      sortOrder = 'NameAsc',
      modifiedAfter = '2000-01-01',
      active = 'Both',
      pageNumber = 1,
    } = opts
    const envelope = soapEnvelope(
      'SearchContacts',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>
      <tns:domainID>${escapeXml(this.administrationId)}</tns:domainID>
      <tns:searchOption>${escapeXml(searchOption)}</tns:searchOption>
      <tns:searchValue>${escapeXml(searchValue)}</tns:searchValue>
      <tns:sortOrder>${escapeXml(sortOrder)}</tns:sortOrder>
      <tns:modifiedAfter>${escapeXml(modifiedAfter)}</tns:modifiedAfter>
      <tns:active>${escapeXml(active)}</tns:active>
      <tns:pageNumber>${pageNumber}</tns:pageNumber>`,
    )
    return this.soapPost('Contact', envelope, 'SearchContacts')
  }

  async updateContact(xmlDoc: string): Promise<string> {
    const sessionId = await this.getSessionId('Contact')
    const envelope = soapEnvelope(
      'UpdateContact',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>
      <tns:domainID>${escapeXml(this.administrationId)}</tns:domainID>
      <tns:xmlDoc><![CDATA[${xmlDoc}]]></tns:xmlDoc>`,
    )
    return this.soapPost('Contact', envelope, 'UpdateContact')
  }

  // ── Accounting ────────────────────────────────────────────────────────────

  /**
   * Administrations() — lists all administrations accessible with the current
   * access key.  Lives on Accounting.asmx, takes only sessionID.
   * Returns XML with <Administration> elements.
   */
  async administrations(): Promise<string> {
    const sessionId = await this.getSessionId('Accounting')
    const envelope = soapEnvelope(
      'Administrations',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>`,
    )
    return this.soapPost('Accounting', envelope, 'Administrations')
  }

  async processJournal(xmlDoc: string): Promise<string> {
    const sessionId = await this.getSessionId('Accounting')
    const envelope = soapEnvelope(
      'ProcessJournal',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>
      <tns:administrationID>${escapeXml(this.administrationId)}</tns:administrationID>
      <tns:xmlDoc><![CDATA[${xmlDoc}]]></tns:xmlDoc>`,
    )
    return this.soapPost('Accounting', envelope, 'ProcessJournal')
  }

  async glAccountBalance(transactionDate: string): Promise<string> {
    const sessionId = await this.getSessionId('Accounting')
    const envelope = soapEnvelope(
      'GLAccountBalance',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>
      <tns:administrationID>${escapeXml(this.administrationId)}</tns:administrationID>
      <tns:transactionDate>${escapeXml(transactionDate)}</tns:transactionDate>`,
    )
    return this.soapPost('Accounting', envelope, 'GLAccountBalance')
  }

  // ── AccountingInfo ────────────────────────────────────────────────────────

  async getGLAccountScheme(): Promise<string> {
    const sessionId = await this.getSessionId('AccountingInfo')
    const envelope = soapEnvelope(
      'GetGLAccountScheme',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>
      <tns:administrationID>${escapeXml(this.administrationId)}</tns:administrationID>`,
    )
    return this.soapPost('AccountingInfo', envelope, 'GetGLAccountScheme')
  }

  async getTransactionDetails(opts: {
    glAccountCode: string
    startDate: string
    endDate: string
    financialMode?: boolean
  }): Promise<string> {
    const sessionId = await this.getSessionId('AccountingInfo')
    const { glAccountCode, startDate, endDate, financialMode = false } = opts
    const envelope = soapEnvelope(
      'GetTransactionDetails',
      `      <tns:sessionID>${escapeXml(sessionId)}</tns:sessionID>
      <tns:administrationID>${escapeXml(this.administrationId)}</tns:administrationID>
      <tns:GLAccountCode>${escapeXml(glAccountCode)}</tns:GLAccountCode>
      <tns:StartDate>${escapeXml(startDate)}</tns:StartDate>
      <tns:EndDate>${escapeXml(endDate)}</tns:EndDate>
      <tns:financialMode>${financialMode ? 1 : 0}</tns:financialMode>`,
    )
    return this.soapPost('AccountingInfo', envelope, 'GetTransactionDetails')
  }
}

// ── Lightweight XML parse helpers (no external deps) ─────────────────────────

/** Extract all text matches for a tag from SOAP XML */
export function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim())
  }
  return out
}

/** Extract the first occurrence of a tag value */
export function extractFirst(xml: string, tag: string): string {
  return extractAll(xml, tag)[0] ?? ''
}

/**
 * Extract all sibling element groups delimited by <tag>...</tag>.
 * Returns array of raw inner XML strings.
 */
export function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1])
  }
  return out
}

/** Unescape XML entities in text content */
export function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
