/**
 * ComsignTrust adapter (WeSign REST API v3).
 *
 * ComsignTrust (Comda group) runs WeSign, a cloud e-signature platform at
 * wse.comsigntrust.com. Its OpenAPI is published on that host:
 *   https://wse.comsigntrust.com/api/swagger/v3/swagger.json
 *
 * A WeSign "document collection" is the envelope: documents plus the signers
 * routed to sign them.
 *   - `GET /v3/DocumentCollections`            → Envelope list (offset/limit)
 *   - `GET /v3/DocumentCollections/info/{id}`  → Envelope, and its `signers[]`
 *                                                and `documentsIds[]`
 *   - `GET /v3/DocumentCollections/{id}/documents/{documentId}/pages`
 *                                              → a document's name + page count
 *
 * Audit trail: WeSign serves a collection's trace only as a downloaded file
 * (`GET /v3/DocumentCollections/{id}/audit/{offset}`, "Download document
 * collection trace as separate file", response `format: binary`), so there
 * are no audit entries to list and both audit methods refuse.
 *
 * Signer and document ids are `<collectionId>:<id>`: WeSign addresses both
 * only within their collection.
 *
 * Auth: `Authorization: Bearer <JWT>` per the spec's `Bearer` security
 * scheme. No interactive OAuth flow, so `getAuthUrl()` throws and credentials
 * are collected via the Connect Link `credentialFields()` form.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import { COMSIGNTRUST_CREDENTIAL_FORM, refreshComsigntrustCredentials } from './auth'
import { ComsigntrustClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformEnvelope,
  type RawWeSignDocumentCollection,
  type RawWeSignDocumentCollectionList,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawWeSignDocumentCount } from './transform/document'

const AUDIT_REFUSAL =
  'ComsignTrust cannot list audit trail entries: WeSign serves the trail only as a file ' +
  '("Download document collection trace as separate file", GET /v3/DocumentCollections/{id}/audit/{offset}, ' +
  'response format: binary)'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * At most this many "Get pages count by document id" requests are in flight
 * at once. WeSign documents no page-size maximum or rate limit, so a large
 * caller page must not fan out into that many concurrent requests.
 */
const PAGES_LOOKUP_CONCURRENCY = 4

/** `Promise.all(items.map(fn))` with at most `limit` calls in flight; keeps order. */
async function mapBounded<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Split a `<collectionId>:<id>` canonical id. */
function splitChildId(id: string, kind: string): [string, string] {
  const at = id.indexOf(':')
  const collectionId = at > 0 ? id.slice(0, at) : ''
  const childId = at > 0 ? id.slice(at + 1) : ''
  if (!collectionId || !childId) {
    throw new Error(
      `comsigntrust ${kind} id must have the shape "<documentCollectionId>:<${kind}Id>"`,
    )
  }
  return [collectionId, childId]
}

export class ComsigntrustAdapter implements DocsignAdapter {
  readonly platform = 'comsigntrust'
  readonly version = '0.2.0'

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('comsigntrust uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('comsigntrust uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshComsigntrustCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return COMSIGNTRUST_CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return COMSIGNTRUST_CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  private client(credentials: Credentials): ComsigntrustClient {
    return new ComsigntrustClient(credentials)
  }

  private async collectionInfo(
    credentials: Credentials,
    collectionId: string,
  ): Promise<RawWeSignDocumentCollection> {
    return this.client(credentials).get<RawWeSignDocumentCollection>(
      `/DocumentCollections/info/${encodeURIComponent(collectionId)}`,
    )
  }

  // ── Envelopes (document collections) ────────────────────────────────────────

  /**
   * `GET /v3/DocumentCollections` takes `offset` and `limit` (int32, defaults
   * 0 and 20). WeSign's own client sends a 0-based row offset and a row count,
   * and reads the total from `x-total-count`
   * (https://wse.comsigntrust.com/chunk-WBQRGJSL.js):
   *   p.offset=e,p.limit=t-e ... Number(M.headers.get("x-total-count"))
   * where `e`/`t` are the grid's startRow/endRow. The status booleans all
   * default to true, so leaving them out lists every status.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const limit = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const offset = pageOffset(params, limit)
    const { data, headers } = await this.client(
      credentials,
    ).getWithHeaders<RawWeSignDocumentCollectionList>('/DocumentCollections', { offset, limit })
    const rows = data?.documentCollections ?? []
    const total = Number(headers['x-total-count'])
    if (headers['x-total-count'] !== undefined && Number.isInteger(total) && total >= 0) {
      reportUpstreamPage(params, { totalCount: total, hasMore: offset + rows.length < total })
    } else {
      // No total: a short page is the end.
      reportUpstreamPage(params, { hasMore: rows.length >= limit })
    }
    return rows.map(transformEnvelope)
  }

  /** `GET /v3/DocumentCollections/info/{id}` — "Get info for document collection". */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.collectionInfo(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/signature-requests/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (DocumentCollectionResposneDTO.signers) ─────────────────────────

  /** A collection's signers come whole on its info response; paged locally. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const info = await this.collectionInfo(credentials, envelopeId)
    const signers = (info.signers ?? []).map((s) => transformSigner(s, envelopeId))
    return pageLocally(signers, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [collectionId, signerId] = splitChildId(id, 'signer')
    const info = await this.collectionInfo(credentials, collectionId)
    const raw = (info.signers ?? []).find((s) => s.id === signerId)
    if (!raw) throw new Error(`Signer ${signerId} not found on document collection ${collectionId}`)
    return transformSigner(raw, collectionId)
  }

  // ── Documents (metadata only — content REFUSED) ─────────────────────────────

  private async documentCount(
    credentials: Credentials,
    collectionId: string,
    docId: string,
  ): Promise<RawWeSignDocumentCount> {
    return this.client(credentials).get<RawWeSignDocumentCount>(
      `/DocumentCollections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(docId)}/pages`,
    )
  }

  /**
   * The info response lists the collection's `documentsIds` whole; the ids are
   * paged locally, and only the caller's page is resolved to a name and page
   * count through "Get pages count by document id".
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const info = await this.collectionInfo(credentials, envelopeId)
    const ids = (info.documentsIds ?? []).map((docId, order) => ({ docId, order }))
    const page = pageLocally(ids, params)
    return mapBounded(page, PAGES_LOOKUP_CONCURRENCY, async ({ docId, order }) =>
      transformDocument(
        await this.documentCount(credentials, envelopeId, docId),
        envelopeId,
        order,
      ),
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [collectionId, docId] = splitChildId(id, 'document')
    const info = await this.collectionInfo(credentials, collectionId)
    const order = (info.documentsIds ?? []).indexOf(docId)
    if (order < 0)
      throw new Error(`Document ${docId} not found on document collection ${collectionId}`)
    return transformDocument(
      await this.documentCount(credentials, collectionId, docId),
      collectionId,
      order,
    )
  }

  // ── Audit-trail entries — REFUSED (file download only) ──────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(AUDIT_REFUSAL)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(AUDIT_REFUSAL.replace('cannot list', 'cannot read'))
  }
}
