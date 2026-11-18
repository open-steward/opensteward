/**
 * Adobe Acrobat Sign adapter.
 *
 * Maps Adobe Sign `agreements` → canonical `Envelope`, participantSets
 * memberInfos → `Signer`, fileInfos → `Document`, agreement events →
 * `AuditTrailEntry`, library documents → `Template`.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as adobeExchange,
  refreshCredentials as adobeRefresh,
} from './auth'
import { AdobeAcrobatSignClient } from './client'
import { DEFAULT_BASE_URI, DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import {
  verifyAdobeAcrobatSignWebhook,
  parseAdobeAcrobatSignWebhookEvents,
} from './webhook'

import { transformEnvelope, type RawAdobeSignAgreement } from './transform/envelope'
import {
  transformSigner,
  type RawAdobeSignMember,
  type RawAdobeSignParticipantSet,
} from './transform/signer'
import { transformDocument, type RawAdobeSignDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawAdobeSignEvent,
} from './transform/audit-trail-entry'
import {
  transformTemplate,
  type RawAdobeSignLibraryDocument,
} from './transform/template'

export interface AdobeAcrobatSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `PageInfo` in the v6 spec: `nextCursor` starts the next page, absent on the last. */
interface AdobeSignPageInfo {
  nextCursor?: string | null
}

interface AgreementListResponse {
  userAgreementList?: RawAdobeSignAgreement[]
  page?: AdobeSignPageInfo
}

interface AgreementParticipantsResponse {
  participantSets?: RawAdobeSignParticipantSet[]
}

interface AgreementDocumentsResponse {
  documents?: RawAdobeSignDocument[]
}

interface AgreementEventsResponse {
  events?: RawAdobeSignEvent[]
}

interface LibraryDocumentsResponse {
  libraryDocumentList?: RawAdobeSignLibraryDocument[]
  page?: AdobeSignPageInfo
}

export class AdobeAcrobatSignAdapter implements DocsignAdapter {
  readonly platform = 'adobe-acrobat-sign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AdobeAcrobatSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return adobeExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return adobeRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAdobeAcrobatSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAdobeAcrobatSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): AdobeAcrobatSignClient {
    return new AdobeAcrobatSignClient(credentials)
  }

  /**
   * One caller page of a cursor-paged v6 collection (`GET /agreements`,
   * `GET /libraryDocuments`). The spec's paging params are `cursor` ("Used to
   * navigate through the pages. If not provided, returns the first page.")
   * and `pageSize`; the response's `page.nextCursor` starts the next page.
   * One upstream page at `pageSize = limit` is one caller page, so the
   * worker's 1-based `page` is resolved through the cursor pager.
   *
   * A caller-supplied `cursor` is still forwarded as-is for one page.
   */
  private async cursorPage<Res extends { page?: AdobeSignPageInfo }, R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    pick: (res: Res) => R[] | undefined,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.get<Res>(path, { pageSize, ...(cursor ? { cursor } : {}) })
      return { items: pick(res) ?? [], next: res.page?.nextCursor || undefined }
    }
    const explicit = params['cursor'] ? String(params['cursor']) : undefined
    if (explicit) {
      const one = await fetchPage(explicit)
      reportUpstreamPage(params, { hasMore: one.next !== undefined })
      return one.items
    }
    const account = String(credentials.extra?.['apiAccessPoint'] ?? DEFAULT_BASE_URI)
    const key = cursorPagerKey(
      connectionScope(`adobe-acrobat-sign:${account}`, credentials),
      path,
      { limit: pageSize },
    )
    const result = await pageByCursor<R, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const rows = await this.cursorPage(
      credentials,
      '/agreements',
      params,
      (res: AgreementListResponse) => res.userAgreementList,
    )
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawAdobeSignAgreement>(`/agreements/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/agreements/${id}/state`, {
      state: 'CANCELLED',
      agreementCancellationInfo: {
        comment: data?.reason ?? 'Voided by API',
        notifyOthers: false,
      },
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /agreements/{id}/members takes no paging params and returns every
    // participant set, so the whole collection is sliced locally.
    const res = await this.client(credentials).get<AgreementParticipantsResponse>(
      `/agreements/${envelopeId}/members`,
    )
    const out: Signer[] = []
    for (const set of res.participantSets ?? []) {
      for (const m of (set.memberInfos ?? []) as RawAdobeSignMember[]) {
        out.push(transformSigner(m, set, envelopeId))
      }
    }
    return pageLocally(out, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [setId, memberId] = id.split(':')
    if (!setId || !memberId) {
      throw new Error('Adobe Sign signer id expects shape "<participantSetId>:<memberId>"')
    }
    // To resolve, we need an envelope context — look up via the participant
    // set's enclosing agreement using the agreements endpoint.
    throw new Error('Adobe Sign does not expose a global signer lookup; use listSigners(envelopeId).')
  }

  // ── Documents (metadata only) ────────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // No paging params on this endpoint: it returns every document, sliced locally.
    const res = await this.client(credentials).get<AgreementDocumentsResponse>(
      `/agreements/${envelopeId}/documents`,
    )
    return pageLocally(
      (res.documents ?? []).map((raw, i) => transformDocument(raw, envelopeId, i)),
      params,
    )
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    // Adobe Sign exposes individual document detail at
    // /agreements/{id}/documents/{documentId} but requires envelope context;
    // the caller is expected to supply the canonical id which is the platform
    // document id (globally unique within the agreement).
    throw new Error('Adobe Sign documents must be fetched via listDocuments(envelopeId).')
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // No paging params on this endpoint: it returns every event, sliced locally.
    const res = await this.client(credentials).get<AgreementEventsResponse>(
      `/agreements/${envelopeId}/events`,
    )
    return pageLocally(
      (res.events ?? []).map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(
    credentials: Credentials,
    id: string,
  ): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('Adobe Sign audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (library documents) ────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const rows = await this.cursorPage(
      credentials,
      '/libraryDocuments',
      params,
      (res: LibraryDocumentsResponse) => res.libraryDocumentList,
    )
    return rows.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawAdobeSignLibraryDocument>(
      `/libraryDocuments/${id}`,
    )
    return transformTemplate(raw)
  }
}
