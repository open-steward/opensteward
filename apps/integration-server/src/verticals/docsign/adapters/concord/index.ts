/**
 * Concord adapter (US contract lifecycle management with native e-signature).
 *
 * Every endpoint, parameter and field below comes from Concord's published
 * OpenAPI document, https://api.doc.concordnow.com/concord-openapi-bundled.yaml
 * (rendered at https://api.doc.concordnow.com/):
 *   - base URL "https://api.concordnow.com/api/rest/1/ - production"
 *   - auth: the X-API-KEY header, the spec's only security scheme
 *   - envelopes: ListAgreements, GET /user/me/organizations/{organizationId}/agreements
 *     (paged by `page` and `numberOfItemsByPage`), and GetAgreement,
 *     GET /organizations/{organizationId}/agreements/{agreementUid}
 *   - templates: the same two endpoints, stages TEMPLATE and TEMPLATE_AUTO
 *   - signers: GET .../agreements/{agreementUid}/signature (the slots)
 *   - documents: GET .../agreements/{agreementUid}/attachments
 *   - audit trail: GET .../agreements/{agreementUid}/activities?type=AUDIT
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  concordOrganizationId,
  credentialFields as concordCredentialFields,
  exchangeCredentials as concordExchangeCredentials,
} from './auth'
import { ConcordClient } from './client'
import { DEFAULT_PAGE_SIZE, ENVELOPE_STATUSES, TEMPLATE_STATUSES } from './constants'
import { verifyConcordWebhook, parseConcordWebhookEvents } from './webhook'

import {
  transformAgreement,
  transformEnvelope,
  type RawConcordAgreement,
  type RawConcordAgreementListItem,
} from './transform/envelope'
import {
  signatureSlots,
  slotNamesSigner,
  transformSigner,
  type RawConcordSignatureMetadata,
} from './transform/signer'
import { transformDocument, type RawConcordAttachment } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawConcordActivityAudit,
} from './transform/audit-trail-entry'
import {
  requireTemplateStatus,
  transformTemplate,
  transformTemplateAgreement,
} from './transform/template'

export interface ConcordAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * AgreementListDto, required: items, numberOfItems ("Number of items in the
 * response"), numberOfItemsByPage ("Maximum number of items in a single
 * page"), page ("Current page number", example 0), total ("Total number of
 * documents and invitations matching the request parameters"),
 * totalInvitations.
 */
interface AgreementListDto {
  items: RawConcordAgreementListItem[]
  numberOfItems?: number
  numberOfItemsByPage?: number
  page?: number
  total?: number
  totalInvitations?: number
}

/** Listtheattachmentsresponse, required: attachments. */
interface AttachmentsResponse {
  attachments: RawConcordAttachment[]
}

/** GetActivitiesAuditResponse, required: activities. */
interface ActivitiesAuditResponse {
  activities: RawConcordActivityAudit[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function expectArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`concord ${what} did not return an array`)
  return value as T[]
}

/**
 * At most this many per-row lookups (SignatureGet for an envelope, List the
 * attachments for a template) are in flight at once. Concord documents no
 * page-size maximum or rate limit, so a large caller page must not fan out
 * into that many concurrent requests.
 */
const ROW_LOOKUP_CONCURRENCY = 4

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

const ENVELOPE_STAGES: readonly string[] = ENVELOPE_STATUSES

function segment(id: string): string {
  return encodeURIComponent(id)
}

export class ConcordAdapter implements DocsignAdapter {
  readonly platform = 'concord'
  readonly version = '0.2.0'

  constructor(_config: ConcordAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('concord uses static API key auth (X-API-KEY); use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('concord uses static API key auth (X-API-KEY); use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return concordCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return concordExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyConcordWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseConcordWebhookEvents(payload)
  }

  private client(credentials: Credentials): ConcordClient {
    return new ConcordClient(credentials)
  }

  private agreementPath(credentials: Credentials, agreementUid: string, suffix = ''): string {
    const org = encodeURIComponent(concordOrganizationId(credentials))
    return `/organizations/${org}/agreements/${segment(agreementUid)}${suffix}`
  }

  /**
   * One caller page of ListAgreements. The endpoint pages by `page` ("The
   * page to display.") and `numberOfItemsByPage` ("Number to display per
   * page."); its reply echoes `page` as "Current page number" with example 0,
   * so pages are 0-based and the caller's 1-based page N is `page=N-1`. No
   * maximum page size is documented, so the caller's limit is sent as is.
   *
   * `isInboxed=false` because the filter reads "Display only documents that
   * appear in the inbox (false to display also archived documents)".
   *
   * The end signal is the reply's own: a page holding fewer than
   * `numberOfItemsByPage` items is the last, and so is one that reaches
   * `total`. `total` also counts invitations, so it is not reported as the
   * row count.
   */
  private async listAgreements(
    credentials: Credentials,
    params: QueryParams,
    statuses: readonly string[],
  ): Promise<RawConcordAgreementListItem[]> {
    const org = encodeURIComponent(concordOrganizationId(credentials))
    const size = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const page = pageOffset(params, size) / size
    const res = await this.client(credentials).get<AgreementListDto>(
      `/user/me/organizations/${org}/agreements`,
      { statuses: [...statuses], isInboxed: false, page, numberOfItemsByPage: size },
    )
    const items = expectArray<RawConcordAgreementListItem>(res?.items, 'ListAgreements')
    const perPage = typeof res.numberOfItemsByPage === 'number' ? res.numberOfItemsByPage : size
    if (perPage < size) {
      // Page N-1 at a smaller size is not the caller's rows; striding on would skip some.
      throw new Error(
        `concord ListAgreements served ${perPage} items per page where ${size} were asked`,
      )
    }
    const full = items.length >= size
    const belowTotal = typeof res.total === 'number' ? (page + 1) * size < res.total : true
    reportUpstreamPage(params, { hasMore: full && belowTotal })
    return items
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /** SignatureGet: GET .../agreements/{agreementUid}/signature. */
  private signature(
    credentials: Credentials,
    agreementUid: string,
  ): Promise<RawConcordSignatureMetadata> {
    return this.client(credentials).get<RawConcordSignatureMetadata>(
      this.agreementPath(credentials, agreementUid, '/signature'),
    )
  }

  /** List the attachments: GET .../agreements/{agreementUid}/attachments. */
  private async attachments(
    credentials: Credentials,
    agreementUid: string,
  ): Promise<RawConcordAttachment[]> {
    const res = await this.client(credentials).get<AttachmentsResponse>(
      this.agreementPath(credentials, agreementUid, '/attachments'),
    )
    return expectArray<RawConcordAttachment>(res?.attachments, 'List the attachments')
  }

  /**
   * ListAgreements rows, each joined with its SignatureGet reply: the list
   * row carries no signing order or signers, and SignatureMetadataGet's
   * `enforceOrder` and `slots` are their only documented source.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const items = await this.listAgreements(credentials, params, ENVELOPE_STATUSES)
    return mapBounded(items, ROW_LOOKUP_CONCURRENCY, async (item) =>
      transformEnvelope(item, await this.signature(credentials, item.uuid)),
    )
  }

  /**
   * GetAgreement: GET /organizations/{organizationId}/agreements/{agreementUid},
   * joined with SignatureGet. An agreement outside the stages listEnvelopes
   * asks for (a template, an invitation, the trash) is a 404, so a read-back
   * agrees with the list.
   */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawConcordAgreement>(
      this.agreementPath(credentials, id),
    )
    const stage = raw?.metadata?.status
    if (typeof stage === 'string' && !ENVELOPE_STAGES.includes(stage)) {
      throw Object.assign(
        new Error(`concord agreement ${id} is not an envelope (status ${stage})`),
        { statusCode: 404, code: 'NOT_FOUND' },
      )
    }
    return transformAgreement(raw, await this.signature(credentials, id))
  }

  /**
   * Write method, out of scope for the list rebuild. `/documents/{id}/cancel`
   * on the old host is not a Concord path; the documented cancel is PatchAgreement
   * (PATCH /organizations/{organizationId}/agreements/{agreementUid},
   * "Patches the status of an agreement to either "SIGNING" or "BROKEN"").
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  /**
   * SignatureGet: GET .../agreements/{agreementUid}/signature, "Get agreement
   * signature metadata with slots information." The slots come back whole
   * with no paging, so the caller's page is cut locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const slots = signatureSlots(await this.signature(credentials, envelopeId), envelopeId)
    const signers = slots.filter(slotNamesSigner)
    return pageLocally(signers, params).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported(
      'Concord cannot read a signer by id: signature slots are only returned inside ' +
        'GET /organizations/{organizationId}/agreements/{agreementUid}/signature; use listSigners',
    )
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  /**
   * "List the attachments": GET .../agreements/{agreementUid}/attachments,
   * `{ attachments: [...] }` with no paging, cut locally. `order` is the
   * position in the whole list, taken before the slice.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const rows = await this.attachments(credentials, envelopeId)
    const indexed = rows.map((raw, order) => ({ raw, order }))
    return pageLocally(indexed, params).map(({ raw, order }) =>
      transformDocument(raw, envelopeId, order),
    )
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported(
      'Concord cannot read an attachment by its id alone: the only attachment path is ' +
        '/organizations/{organizationId}/agreements/{agreementUid}/attachments/{id}; use listDocuments',
    )
  }

  // ── Audit trail ───────────────────────────────────────────────────────────

  private async auditActivities(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<RawConcordActivityAudit[]> {
    const res = await this.client(credentials).get<ActivitiesAuditResponse>(
      this.agreementPath(credentials, envelopeId, '/activities'),
      { type: 'AUDIT' },
    )
    return expectArray<RawConcordActivityAudit>(res?.activities, 'GetActivities')
  }

  /**
   * GetActivities: GET .../agreements/{agreementUid}/activities with the
   * required `type` ("enum: AUDIT, CHAT") set to AUDIT. The reply is the whole
   * `activities` array with no paging, cut locally.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const rows = await this.auditActivities(credentials, envelopeId)
    return pageLocally(rows, params).map((raw) => transformAuditTrailEntry(raw, envelopeId))
  }

  /** Entry ids are `<agreementUid>:<activity id>`; read back through GetActivities. */
  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const at = id.lastIndexOf(':')
    const envelopeId = at > 0 ? id.slice(0, at) : ''
    const activityId = at > 0 ? id.slice(at + 1) : ''
    if (!envelopeId || !activityId) {
      throw new Error('concord audit-trail id expects shape "<agreementUid>:<activityId>"')
    }
    const found = (await this.auditActivities(credentials, envelopeId)).find(
      (a) => a.id === activityId,
    )
    if (!found) {
      throw Object.assign(new Error(`concord audit entry ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformAuditTrailEntry(found, envelopeId)
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /**
   * ListAgreements restricted to the TEMPLATE and TEMPLATE_AUTO stages. Each
   * row's documentCount is the length of its List the attachments reply, the
   * records listDocuments returns for it; the list row carries no count.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const items = await this.listAgreements(credentials, params, TEMPLATE_STATUSES)
    return mapBounded(items, ROW_LOOKUP_CONCURRENCY, async (item) =>
      transformTemplate(item, (await this.attachments(credentials, item.uuid)).length),
    )
  }

  /** GetAgreement; an agreement that is not in a template stage is a 404. */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawConcordAgreement>(
      this.agreementPath(credentials, id),
    )
    requireTemplateStatus(raw?.metadata?.status, id)
    const count = (await this.attachments(credentials, id)).length
    return transformTemplateAgreement(raw, count)
  }
}
