/**
 * Signhost adapter (Entrust Signhost, Dutch eIDAS QTSP). Static key-pair auth:
 * every request carries `Application: APPKey …` and `Authorization: APIKey …`
 * (https://developer.signhost.com/guide/features/authentication.md).
 *
 * The API's whole read surface, from "API Operations" of
 * https://developer.signhost.com/openapi/index.md, is
 *   `GET /api/transaction/{transactionId}` ("Get a transaction by ID"),
 *   `GET /api/file/receipt/{transactionId}` (a PDF receipt) and
 *   `GET /api/transaction/{transactionId}/file/{fileId}` (a PDF file).
 * So:
 *   - envelopes:   get by id only; listing is refused (no list operation).
 *   - signers:     the transaction's `Signers` array, paged locally.
 *   - documents:   the transaction's `Files` map, paged locally.
 *   - audit trail: every signer's `Activities`, paged locally.
 *   - templates:   refused (no template operation).
 */
import { pageLocally } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as signhostCredentialFields,
  exchangeCredentials as signhostExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SignhostClient } from './client'
import { verifySignhostWebhook, parseSignhostWebhookEvents } from './webhook'

import { transformEnvelope, type RawSignhostTransaction } from './transform/envelope'
import { transformSigner, type RawSignhostSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry } from './transform/audit-trail-entry'

export interface SignhostAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * The operation list of https://developer.signhost.com/openapi/index.md:
 * createTransaction, startTransaction, getTransaction, deleteTransaction,
 * getReceipt, downloadFile, uploadFile.
 */
const OPERATIONS =
  'its API Operations are createTransaction, startTransaction, getTransaction, deleteTransaction, getReceipt, downloadFile and uploadFile'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function transactionPath(id: string): string {
  // "**Path:** `/api/transaction/{transactionId}`" (getTransaction.md); the
  // base URL carries `/api`.
  return `/transaction/${encodeURIComponent(id)}`
}

function signersOf(raw: RawSignhostTransaction, envelopeId: string): RawSignhostSigner[] {
  if (!Array.isArray(raw?.Signers)) {
    throw new Error(`signhost GET /api/transaction/${envelopeId} returned no Signers array`)
  }
  return raw.Signers
}

export class SignhostAdapter implements DocsignAdapter {
  readonly platform = 'signhost'
  readonly version = '0.2.0'

  constructor(_config: SignhostAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('signhost uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return signhostCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return signhostExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignhostWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignhostWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignhostClient {
    return new SignhostClient(credentials)
  }

  /**
   * `GET /api/transaction/{transactionId}`: "Retrieve transaction details
   * including signers, receivers, files, and current status."
   * (https://developer.signhost.com/openapi/transactions/getTransaction.md).
   *
   * Its documented 410 still carries a Transaction: "The transaction details
   * are no longer available and as a result the returned JSON only contains
   * partial historical data. This happens when the system cleaned the
   * transaction for example due to reaching an end status (any status above
   * 30) or the transaction has expired." (Schema: Transaction). That body is
   * read like a 200; the transforms still throw on any required field the
   * partial data lacks.
   */
  private async transaction(credentials: Credentials, id: string): Promise<RawSignhostTransaction> {
    return this.client(credentials).getAccepting<RawSignhostTransaction>(transactionPath(id), [410])
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /**
   * Signhost documents no way to list transactions: the only transaction read
   * is "Get a transaction by ID". Refused before any request.
   */
  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported(
      `Signhost cannot list transactions: ${OPERATIONS}; the only read is "Get a transaction by ID"`,
    )
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.transaction(credentials, id))
  }

  /**
   * Write method, out of scope for the list rebuild. The documented cancel is
   * `DELETE /api/transaction/{transactionId}` with TransactionDeleteOptions
   * (https://developer.signhost.com/openapi/transactions/deleteTransaction.md);
   * this POST path is not documented.
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/transactions/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  /**
   * The transaction's `Signers` ("List of signers attached to this
   * transaction"), returned whole by `GET /api/transaction/{transactionId}`.
   * The caller's page is cut locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.transaction(credentials, envelopeId)
    const all = signersOf(raw, envelopeId).map((s) => transformSigner(s, envelopeId))
    return pageLocally(all, params)
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported(
      `Signhost cannot get a signer by id alone: signers are read only through their transaction (${OPERATIONS}); use listSigners(envelopeId)`,
    )
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  /**
   * The transaction's `Files`: "Files attached to the transaction as a
   * key-value mapping. Key is the file ID, value is the file information."
   * `order` is each file's position in that map; the caller's page is cut
   * locally.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.transaction(credentials, envelopeId)
    const files = raw?.Files ?? {}
    if (typeof files !== 'object' || Array.isArray(files)) {
      throw new Error(
        `signhost GET /api/transaction/${envelopeId} returned Files that is not a map`,
      )
    }
    const all = Object.entries(files).map(([fileId, entry], i) =>
      transformDocument(fileId, entry, envelopeId, i),
    )
    return pageLocally(all, params)
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported(
      `Signhost cannot get a document's metadata by id alone: the only file read by id is downloadFile, which returns the PDF itself (${OPERATIONS}); use listDocuments(envelopeId)`,
    )
  }

  // ── Audit-trail entries ───────────────────────────────────────────────────

  /**
   * Every signer's `Activities` ("Activities/events for this signer",
   * https://developer.signhost.com/openapi/models/Signer.md), in time order.
   * The receipt (`GET /api/file/receipt/{transactionId}`) is a PDF, not
   * structured data. The caller's page is cut locally.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.allAuditTrailEntries(credentials, envelopeId), params)
  }

  private async allAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.transaction(credentials, envelopeId)
    const entries = signersOf(raw, envelopeId).flatMap((signer) =>
      (signer.Activities ?? []).map((a) => transformAuditTrailEntry(a, signer, envelopeId)),
    )
    // Array.prototype.sort is stable: equal timestamps keep signer order.
    return entries.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  }

  /** Reads back an id listAuditTrailEntries returned: `<transactionId>:<activityId>`. */
  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const sep = id.indexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    if (!envelopeId || sep === id.length - 1) {
      throw new Error('signhost audit-trail id expects shape "<transactionId>:<activityId>"')
    }
    const found = (await this.allAuditTrailEntries(credentials, envelopeId)).find(
      (e) => e.id === id,
    )
    if (!found) {
      throw Object.assign(new Error(`signhost audit entry ${id} not found`), { statusCode: 404 })
    }
    return found
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported(`Signhost cannot list templates: ${OPERATIONS}; none of them is a template`)
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported(`Signhost cannot get templates: ${OPERATIONS}; none of them is a template`)
  }
}
