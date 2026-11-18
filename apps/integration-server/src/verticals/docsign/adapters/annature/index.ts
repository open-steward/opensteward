/**
 * Annature adapter (Australian e-signature). Static key-pair auth: every
 * request carries `X-Annature-Id` (public key) and `X-Annature-Key` (private
 * key) — https://docs.annature.com.au/api-reference/authentication.md.
 *
 * Endpoints, all from https://docs.annature.com.au/llms.txt and the pages it
 * indexes:
 *   - envelopes:  GET /v2/envelopes (cursor-paged; non-drafts, then status=draft),
 *                 GET /v1/envelopes/:id
 *   - signers:    the `recipients` array of GET /v1/envelopes/:id
 *   - documents:  GET /v1/documents?envelope_id= (a bare array)
 *   - templates:  GET /v1/templates (a bare array, at most 250, keyset-paged on
 *                 created_before), GET /v1/templates/:id
 *   - audit trail: no endpoint; refused with 501.
 */
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  annaturePublicKey,
  credentialFields as annatureCredentialFields,
  exchangeCredentials as annatureExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { AnnatureClient } from './client'
import { API_BASE_URL } from './constants'
import { verifyAnnatureWebhook, parseAnnatureWebhookEvents } from './webhook'

import { transformEnvelope, type RawAnnatureEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawAnnatureDocument } from './transform/document'
import { transformTemplate, type RawAnnatureTemplate } from './transform/template'

export interface AnnatureAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** "List all envelopes (paged)": `GET /v2/envelopes`. */
const ENVELOPES_PAGED_PATH = '/v2/envelopes'

/**
 * One page of `GET /v2/envelopes`
 * (https://docs.annature.com.au/api-reference/envelopes/list-all-envelopes-paged.md):
 * `{ "envelopes": [...], "cursor": "...", "has_more": true }`.
 */
interface EnvelopesPage {
  envelopes: RawAnnatureEnvelope[]
  cursor?: string | null
  has_more?: boolean
}

/** A position in the envelope stream: which walk (drafts or not), and its cursor. */
interface EnvelopeWalkCursor {
  drafts: boolean
  cursor?: string
}

/** "The response is limited to a maximum of 250 results." (List all templates) */
const TEMPLATES_MAX_RESULTS = 250

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function expectArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`annature ${what} did not return an array`)
  return value as T[]
}

export class AnnatureAdapter implements DocsignAdapter {
  readonly platform = 'annature'
  readonly version = '0.2.0'

  constructor(_config: AnnatureAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('annature uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return annatureCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return annatureExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAnnatureWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAnnatureWebhookEvents(payload)
  }

  private client(credentials: Credentials): AnnatureClient {
    return new AnnatureClient(credentials)
  }

  /** The API key pair's account (public key), fingerprinted per connection. */
  private scope(credentials: Credentials): string {
    return connectionScope(`${API_BASE_URL}#${annaturePublicKey(credentials)}`, credentials)
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /**
   * `GET /v2/envelopes` pages by cursor and takes no page size: "To fetch the
   * next page of results, pass the `cursor` value from the previous response.
   * The `has_more` property indicates whether additional results are
   * available."
   * (https://docs.annature.com.au/api-reference/envelopes/list-all-envelopes-paged.md).
   * Its pages are sized by Annature, so the caller's page is cut out of them
   * by `pageByRows`. The key carries no size: the upstream page never
   * depends on the caller's limit.
   *
   * "By default, envelopes with a status of `draft` are excluded unless the
   * `status` parameter is explicitly provided." `status` is an "Exact-match
   * filter" whose "Valid values include `draft`", so the stream is two
   * walks: every non-draft envelope (no filter), then `status=draft`. The
   * two sets are disjoint and together are every envelope.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), ENVELOPES_PAGED_PATH, {
      walks: 'default,status=draft',
    })
    const { items } = await pageByRows<RawAnnatureEnvelope, EnvelopeWalkCursor>(
      key,
      params,
      async (at) => {
        const drafts = at?.drafts === true
        const query: Record<string, string> = {}
        if (drafts) query['status'] = 'draft'
        if (at?.cursor !== undefined) query['cursor'] = at.cursor
        const res = await client.get<EnvelopesPage>(
          ENVELOPES_PAGED_PATH,
          Object.keys(query).length === 0 ? undefined : query,
        )
        const rows = expectArray<RawAnnatureEnvelope>(res?.envelopes, 'GET /v2/envelopes')
        if (res.has_more === true) {
          if (typeof res.cursor !== 'string' || res.cursor === '') {
            throw new Error('annature GET /v2/envelopes reported has_more without a cursor')
          }
          return { items: rows, next: { drafts, cursor: res.cursor } }
        }
        // The non-draft walk has ended; the drafts follow it.
        return { items: rows, next: drafts ? undefined : { drafts: true } }
      },
    )
    return items.map(transformEnvelope)
  }

  /** `GET /v1/envelopes/:id` (https://docs.annature.com.au/api-reference/envelopes/retrieve-envelope.md). */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawAnnatureEnvelope>(
      `/v1/envelopes/${encodeURIComponent(id)}`,
    )
    return transformEnvelope(raw)
  }

  /**
   * Write method, out of scope for the list rebuild: the documented endpoint
   * is `POST /v1/envelopes/:id/void`
   * (https://docs.annature.com.au/api-reference/envelopes/void-envelope.md);
   * this path is not documented.
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/v1/transactions/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  /**
   * Recipients have no list endpoint; they come back whole in the envelope's
   * `recipients` array from `GET /v1/envelopes/:id`, "in the same order they
   * were provided". The caller's page is cut locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawAnnatureEnvelope>(
      `/v1/envelopes/${encodeURIComponent(envelopeId)}`,
    )
    const all = expectArray<RawAnnatureEnvelope['recipients'][number]>(
      raw?.recipients,
      'GET /v1/envelopes/:id recipients',
    ).map((r) => transformSigner(r, envelopeId))
    return pageLocally(all, params)
  }

  /**
   * `GET /v1/recipients/:id` exists, but the recipient object it returns
   * carries no envelope id (https://docs.annature.com.au/api-reference/recipients/recipient-object.md),
   * and a canonical Signer requires one. Read signers through listSigners.
   */
  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported(
      'Annature cannot get a signer by id alone: the recipient object returned by GET /v1/recipients/:id has no envelope id; use listSigners(envelopeId)',
    )
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  /**
   * `GET /v1/documents` with the required `envelope_id` "Returns a list of
   * documents that belong to a specific envelope" as a bare array with no
   * paging parameters
   * (https://docs.annature.com.au/api-reference/documents/list-all-documents.md).
   * `order` is each document's position in that whole array; the caller's
   * page is then cut locally.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const rows = await this.client(credentials).get<unknown>('/v1/documents', {
      envelope_id: envelopeId,
    })
    const all = expectArray<RawAnnatureDocument>(rows, 'GET /v1/documents').map((d, i) =>
      transformDocument(d, envelopeId, i),
    )
    return pageLocally(all, params)
  }

  /**
   * "Retrieve a document" (`GET /v1/documents/:id`) lists `envelope_id` as a
   * required parameter
   * (https://docs.annature.com.au/api-reference/documents/retrieve-document.md),
   * which a lookup by document id alone cannot supply.
   */
  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported(
      'Annature cannot get a document by id alone: GET /v1/documents/:id requires envelope_id; use listDocuments(envelopeId)',
    )
  }

  // ── Audit-trail entries ───────────────────────────────────────────────────

  /**
   * The API reference index (https://docs.annature.com.au/llms.txt) lists no
   * audit-trail, history or event-log endpoint; its only event pages are
   * webhook events. The Envelope object's endpoints
   * (https://docs.annature.com.au/api-reference/envelopes/envelope-object.md)
   * are "GET /v1/envelopes", "GET /v1/envelopes/:id", "POST /v1/envelopes",
   * "POST /v1/envelopes/:id/void", "PUT /v1/envelopes/:id" and
   * "DELETE /v1/envelopes/:id".
   */
  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'Annature cannot list audit-trail entries: its API reference documents no audit-trail or envelope history endpoint',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'Annature cannot get audit-trail entries: its API reference documents no audit-trail or envelope history endpoint',
    )
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /**
   * `GET /v1/templates` returns a bare array with no cursor or page
   * parameter, and "The response is limited to a maximum of 250 results."
   * (https://docs.annature.com.au/api-reference/templates/list-all-templates.md).
   * The same page documents the order ("Templates are returned in descending
   * order of creation, with the most recently created appearing first") and
   * a `created_before` filter ("Return templates created **before** the
   * specified ISO 8601 timestamp"), so a full response is followed by keyset
   * paging on `created`, and the caller's page is cut from the whole set.
   *
   * The next request asks for templates created before the oldest `created`
   * plus 1 ms, so templates sharing that timestamp come back again instead
   * of being skipped; repeats are dropped by id. A full response that adds
   * no new template (250 templates within one millisecond, or a
   * `created_before` the API ignored: "Invalid dates are silently ignored")
   * cannot be paged past, and throws rather than report a truncated
   * collection as complete.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const client = this.client(credentials)
    const seen = new Set<string>()
    const all: RawAnnatureTemplate[] = []
    let createdBefore: string | undefined
    for (;;) {
      const rows = expectArray<RawAnnatureTemplate>(
        await client.get<unknown>(
          '/v1/templates',
          createdBefore === undefined ? undefined : { created_before: createdBefore },
        ),
        'GET /v1/templates',
      )
      let added = 0
      for (const row of rows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        all.push(row)
        added++
      }
      if (rows.length < TEMPLATES_MAX_RESULTS) break
      if (added === 0) {
        throw new Error(
          `annature GET /v1/templates returned ${TEMPLATES_MAX_RESULTS} templates already seen; cannot page past created_before=${createdBefore ?? '(none)'}`,
        )
      }
      const oldest = Date.parse(rows[rows.length - 1]!.created ?? '')
      if (!Number.isFinite(oldest)) {
        throw new Error(
          'annature GET /v1/templates returned a full response whose last template has no parseable created timestamp',
        )
      }
      createdBefore = new Date(oldest + 1).toISOString()
    }
    return pageLocally(all.map(transformTemplate), params)
  }

  /**
   * `GET /v1/templates/:id`, listed among the Template object's endpoints
   * (https://docs.annature.com.au/api-reference/templates/template-object.md).
   */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawAnnatureTemplate>(
      `/v1/templates/${encodeURIComponent(id)}`,
    )
    return transformTemplate(raw)
  }
}
