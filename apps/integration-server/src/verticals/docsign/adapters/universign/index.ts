/**
 * Universign adapter (Universign API v1, https://apps.universign.com/docs/api/).
 *
 * French eIDAS-qualified trust service provider. Endpoints, all from that
 * reference ("Base URLs: https://api.universign.com (PROD)"):
 *   - envelopes:  GET /v1/transactions (cursor-paged: `size`, `starting_after`,
 *                 `has_more`), GET /v1/transactions/{transaction_id}
 *   - signers:    `participants[ ]` of GET /v1/transactions/{transaction_id}
 *   - documents:  `documents[ ]` of GET /v1/transactions/{transaction_id}
 *   - templates:  GET /v1/templates (cursor-paged like transactions),
 *                 GET /v1/templates/{template_id}
 *   - audit trail: no endpoint; the evidence file is a PDF. Refused with 501.
 *
 * Auth: HTTP Basic with the API key as username and an empty password. No
 * interactive OAuth flow, so `getAuthUrl()` throws.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  UNIVERSIGN_CREDENTIAL_FIELDS,
  exchangeUniversignCredentials,
  refreshUniversignCredentials,
} from './auth'
import { UniversignClient } from './client'
import {
  API_BASE_URL,
  DEFAULT_SCOPES,
  TEMPLATES_DEFAULT_SIZE,
  TRANSACTION_READ_CONCURRENCY,
  TRANSACTIONS_DEFAULT_SIZE,
  TRANSACTIONS_MAX_SIZE,
} from './constants'
import { verifyUniversignWebhook, parseUniversignWebhookEvents } from './webhook'

import { transformEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate } from './transform/template'
import { splitScopedId } from './transform/shared'
import type {
  RawUniversignPage,
  RawUniversignTemplate,
  RawUniversignTransaction,
  RawUniversignTransactionRow,
} from './transform/types'

export interface UniversignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

const TRANSACTIONS_PATH = '/v1/transactions'
const TEMPLATES_PATH = '/v1/templates'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/** The caller's page size: a whole number ≥ 1, else the documented default. */
function requestedSize(params: QueryParams, fallback: number): number {
  const n = Math.floor(Number(params.limit))
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

/**
 * One `{ has_more, content }` page as a cursor step. Both endpoints page the
 * same way: `starting_after` "Expected value is a transaction ID [template
 * ID]. Use for pagination to return the transactions [templates] listed after
 * the specified transaction [template]", and `has_more` says whether there are
 * more. The next page therefore starts after the last row of this one.
 */
function cursorStep<T extends { id: string }>(
  res: RawUniversignPage<T> | undefined,
  what: string,
): { items: T[]; next?: string } {
  if (!res || !Array.isArray(res.content) || typeof res.has_more !== 'boolean') {
    throw new Error(`Universign ${what} did not return { has_more, content }`)
  }
  if (!res.has_more) return { items: res.content }
  const last = res.content[res.content.length - 1]
  if (!last || typeof last.id !== 'string' || last.id === '') {
    throw new Error(`Universign ${what} reported has_more with no row to page after`)
  }
  return { items: res.content, next: last.id }
}

/** Map with at most `limit` calls in flight, preserving order. */
async function mapBounded<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export class UniversignAdapter implements DocsignAdapter {
  readonly platform = 'universign'
  readonly version = '0.2.0'
  /**
   * GET /v1/transactions: "Maximum is 100". GET /v1/templates documents no
   * maximum, so this one ceiling covers both.
   */
  readonly capabilities = { maxPageSize: TRANSACTIONS_MAX_SIZE }

  private _scopes: string[]

  constructor(config: UniversignAdapterConfig) {
    this._scopes = config.scopes ?? DEFAULT_SCOPES
    void this._scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('universign uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('universign uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshUniversignCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return UNIVERSIGN_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeUniversignCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyUniversignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseUniversignWebhookEvents(payload)
  }

  private client(credentials: Credentials): UniversignClient {
    return new UniversignClient(credentials)
  }

  /** The workspace behind this API key, fingerprinted per connection. */
  private scope(credentials: Credentials): string {
    return connectionScope(API_BASE_URL, credentials)
  }

  /**
   * GET /v1/transactions/{transaction_id} ("Retrieve a transaction"). The
   * object is keyed by the id asked for: participants and documents are
   * identified only within it.
   */
  private async readTransaction(
    client: UniversignClient,
    id: string,
  ): Promise<RawUniversignTransaction> {
    const raw = await client.get<RawUniversignTransaction>(
      `${TRANSACTIONS_PATH}/${encodeURIComponent(id)}`,
    )
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(
        `Universign GET ${TRANSACTIONS_PATH}/{transaction_id} returned no transaction`,
      )
    }
    if (raw.id !== undefined && raw.id !== id) {
      throw new Error(
        `Universign GET ${TRANSACTIONS_PATH}/${id} returned transaction ${String(raw.id)}`,
      )
    }
    return { ...raw, id }
  }

  // ── Envelopes (transactions) ──────────────────────────────────────────────

  /**
   * GET /v1/transactions, `size` "Maximum is 100, default is 50", paged on
   * `starting_after` until `has_more` is false. The list rows carry no
   * documents or instructions ("List all transactions → Returns"), so each
   * row on the served page is read back through GET /v1/transactions/{id}.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const size = Math.min(requestedSize(params, TRANSACTIONS_DEFAULT_SIZE), TRANSACTIONS_MAX_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), TRANSACTIONS_PATH, { size })
    const page = await pageByCursor<RawUniversignTransactionRow>(
      key,
      params.page,
      async (after) => {
        const query: Record<string, unknown> = { size }
        if (after !== undefined) query['starting_after'] = after
        const res = await client.get<RawUniversignPage<RawUniversignTransactionRow>>(
          TRANSACTIONS_PATH,
          query,
        )
        return cursorStep(res, `GET ${TRANSACTIONS_PATH}`)
      },
    )
    reportUpstreamPage(params, { hasMore: page.hasMore, pageSize: size })
    const full = await mapBounded(page.items, TRANSACTION_READ_CONCURRENCY, (row) =>
      this.readTransaction(client, row.id),
    )
    return full.map(transformEnvelope)
  }

  /** GET /v1/transactions/{transaction_id} ("Retrieve a transaction"). */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.readTransaction(this.client(credentials), id))
  }

  /**
   * Write method, out of scope for the list rebuild. The path is the
   * documented POST /v1/transactions/{transaction_id}/cancel; its documented
   * arguments are `cancel_code` and `cancel_reason`, not `reason`.
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`${TRANSACTIONS_PATH}/${encodeURIComponent(id)}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (transaction participants) ────────────────────────────────────

  /**
   * Participants have no list endpoint; they come back whole in the
   * transaction's `participants[ ]` ("The list of participants within the
   * transaction."). The caller's page is cut locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const tx = await this.readTransaction(this.client(credentials), envelopeId)
    return pageLocally(
      (tx.participants ?? []).map((p) => transformSigner(p, tx)),
      params,
    )
  }

  /** `<transactionId>:<participant email or temporary ID>`, as listSigners returns. */
  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [txId, participant] = splitScopedId(id, 'signer')
    const tx = await this.readTransaction(this.client(credentials), txId)
    const p = (tx.participants ?? []).find((x) => x.email === participant)
    if (!p) throw notFound(`Universign transaction ${txId} has no participant ${participant}`)
    return transformSigner(p, tx)
  }

  // ── Documents (metadata only — content refused) ──────────────────────────

  /**
   * Documents have no list endpoint; they come back whole in the
   * transaction's `documents[ ]` ("The documents added to the transaction.").
   * `order` is the position in that array; the caller's page is cut locally.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const tx = await this.readTransaction(this.client(credentials), envelopeId)
    return pageLocally(
      (tx.documents ?? []).map((d, i) => transformDocument(d, tx.id, i)),
      params,
    )
  }

  /** `<transactionId>:<documentId>`, as listDocuments returns. */
  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [txId, docId] = splitScopedId(id, 'document')
    const tx = await this.readTransaction(this.client(credentials), txId)
    const docs = tx.documents ?? []
    const i = docs.findIndex((d) => d.id === docId)
    if (i < 0) throw notFound(`Universign transaction ${txId} has no document ${docId}`)
    return transformDocument(docs[i]!, tx.id, i)
  }

  // ── Audit trail (refused) ────────────────────────────────────────────────

  /**
   * Universign documents no event or audit-trail endpoint. The only audit
   * surface, GET /v1/transactions/{transaction_id}/requester-attestation, is
   * "an evidence file (requester copy) in PDF format".
   */
  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'Universign cannot list audit-trail entries: its only audit surface is "an evidence file (requester copy) in PDF format"',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'Universign cannot get an audit-trail entry: its only audit surface is "an evidence file (requester copy) in PDF format"',
    )
  }

  // ── Templates ────────────────────────────────────────────────────────────

  /**
   * GET /v1/templates, `size` "Default is 50" (no maximum documented), paged
   * on `starting_after` until `has_more` is false. Each row is a whole
   * template object.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const size = requestedSize(params, TEMPLATES_DEFAULT_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), TEMPLATES_PATH, { size })
    const page = await pageByCursor<RawUniversignTemplate>(key, params.page, async (after) => {
      const query: Record<string, unknown> = { size }
      if (after !== undefined) query['starting_after'] = after
      const res = await client.get<RawUniversignPage<RawUniversignTemplate>>(TEMPLATES_PATH, query)
      return cursorStep(res, `GET ${TEMPLATES_PATH}`)
    })
    reportUpstreamPage(params, { hasMore: page.hasMore, pageSize: size })
    return page.items.map(transformTemplate)
  }

  /** GET /v1/templates/{template_id} ("Retrieve a template"). */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawUniversignTemplate>(
      `${TEMPLATES_PATH}/${encodeURIComponent(id)}`,
    )
    return transformTemplate(raw)
  }
}
