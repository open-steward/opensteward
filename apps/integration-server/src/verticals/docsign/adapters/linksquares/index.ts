/**
 * LinkSquares adapter — contract-lifecycle-management platform
 * (api.linksquares.com). The docsign vertical maps onto the LinkSquares
 * Finalize API: a Finalize *agreement* is the canonical `Envelope`, its
 * `agreement_versions` (metadata only) are `Document`s, and the request-form
 * templates are `Template`s. Signers and audit-trail entries are refused
 * (see below).
 *
 * Auth is a single long-lived API key supplied via the `x-api-key` header.
 * The Connect Link flow collects it via the shared `simpleApiKey` template;
 * there is no OAuth and no refresh.
 *
 * Documents are agreement versions, read from "List Agreement Versions"
 * (GET /finalize/v2/agreements/{agreement_id}/agreement_versions) and
 * addressed as `<agreementId>:<versionId>`. The endpoint documents no query
 * parameters; its pages chain through `_links.next.href` ("URL to the next
 * page of items (null if none)"), which is the only way this adapter moves.
 *
 * Refused with 501 NOT_SUPPORTED before any request (per the LinkSquares
 * OpenAPI, https://linksquares.com/api/openapi):
 *   - signers: no path or schema names a party or signer. The agreement's
 *     `_embedded` ("Includes the full sub-resource objects") holds only
 *     users, questions, token_values and statuses.
 *   - audit-trail entries: no path serves an activity log or history.
 *
 * Not implemented (the router returns 501): `voidEnvelope` (Finalize has no
 * cancel/void agreement endpoint). LinkSquares does not document an HMAC
 * webhook-signature scheme, so the adapter does not implement `verifyWebhook`
 * / `parseWebhookEvents`.
 *
 */

import {
  simpleApiKey,
  pageByRows,
  pageOffset,
  cursorPagerKey,
  connectionScope,
  DEFAULT_PAGE_LIMIT,
} from '@opensteward/shared'
import type { Credentials, QueryParams, CursorPage } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as linksquaresExchange,
  refreshCredentials as linksquaresRefresh,
} from './auth'
import { LinksquaresClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawLinksquaresAgreement } from './transform/envelope'
import { transformDocument, type RawLinksquaresAgreementVersion } from './transform/document'
import { transformTemplate, type RawLinksquaresTemplate } from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'lsq_xxxxxxxxxxxxxxxxxxxxxxxx',
  helpText:
    'Mint a key in the LinkSquares web app (Analyze/Finalize Administrator). It is sent on the x-api-key header.',
})

interface AgreementsListResponse {
  agreements?: RawLinksquaresAgreement[]
  data?: RawLinksquaresAgreement[]
  page?: number
  per_page?: number
  total?: number
}

interface TemplatesListResponse {
  templates?: RawLinksquaresTemplate[]
  data?: RawLinksquaresTemplate[]
  page?: number
  per_page?: number
  total?: number
}

/**
 * "List Agreement Versions" 200 body, as documented: `data`, `total_count`
 * and `_links.next.href` / `_links.prev.href`, each "URL to the … page of
 * items (null if none)".
 */
interface AgreementVersionsResponse {
  data: RawLinksquaresAgreementVersion[]
  total_count: number
  _links: {
    next?: { href?: string | null } | null
    prev?: { href?: string | null } | null
  }
}

/** Refuse before sending anything, as the router maps to a 501. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const SIGNERS_REFUSAL =
  'LinkSquares cannot list signers: the Finalize API documents no party or signer resource; ' +
  'an agreement\'s _embedded ("Includes the full sub-resource objects") holds only users, ' +
  'questions, token_values and statuses'

const AUDIT_REFUSAL =
  'LinkSquares cannot list audit trail entries: the Finalize API documents no activity-log ' +
  'or history endpoint for an agreement'

const API_ORIGIN = new URL(API_BASE_URL).origin
const API_PATH_PREFIX = `${new URL(API_BASE_URL).pathname}/`

/**
 * The documented next-page URL, checked to be on the LinkSquares API before
 * the API key is sent to it.
 */
function nextPageHref(res: AgreementVersionsResponse): string | undefined {
  const href = res._links?.next?.href
  if (href == null || href === '') return undefined
  const url = new URL(href, API_BASE_URL)
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith(API_PATH_PREFIX)) {
    throw new Error(
      `LinkSquares returned a next page off its API (${url.origin}); refusing to follow it`,
    )
  }
  return url.toString()
}

export class LinksquaresAdapter implements DocsignAdapter {
  readonly platform = 'linksquares'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support — single API-key form (LinkSquares has no OAuth).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return linksquaresExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return linksquaresRefresh(credentials)
  }

  private client(credentials: Credentials): LinksquaresClient {
    return new LinksquaresClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: typeof params.page === 'number' ? params.page : 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params['status']) out.status = String(params['status'])
    if (params.search) out.q = String(params.search)
    else if (params['q']) out.q = String(params['q'])
    return out
  }

  // ── Envelopes (Finalize agreements) ─────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<AgreementsListResponse>(
      '/agreements',
      this.listParams(params),
    )
    return (res.agreements ?? res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawLinksquaresAgreement>(`/agreements/${id}`, {
      include: 'embedded',
    })
    return transformEnvelope(raw)
  }

  // ── Signers (refused: the Finalize API documents no signer resource) ────────

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported(SIGNERS_REFUSAL)
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported(SIGNERS_REFUSAL)
  }

  // ── Documents (agreement versions — metadata only, content REFUSED) ─────────

  /** One upstream page of List Agreement Versions; `cursor` is a documented next href. */
  private async versionsPage(
    client: LinksquaresClient,
    envelopeId: string,
    cursor: string | undefined,
  ): Promise<CursorPage<RawLinksquaresAgreementVersion, string>> {
    const res = await client.get<AgreementVersionsResponse>(
      cursor ?? `/agreements/${encodeURIComponent(envelopeId)}/agreement_versions`,
    )
    // `data` is a required property of the documented 200 body.
    if (!Array.isArray(res?.data)) {
      throw new Error('LinkSquares List Agreement Versions returned no data array')
    }
    return { items: res.data, next: nextPageHref(res) }
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope('linksquares', credentials),
      `agreement_versions:${envelopeId}`,
      {},
    )
    const { items } = await pageByRows<RawLinksquaresAgreementVersion>(key, params, (cursor) =>
      this.versionsPage(client, envelopeId, cursor),
    )
    // pageByRows cut rows [offset, offset + limit) of the stream, with the
    // same limit arithmetic, so each row's order is its stream position.
    const offset = pageOffset(params, Math.floor(Number(params.limit ?? DEFAULT_PAGE_LIMIT)))
    return items.map((v, i) => transformDocument(v, envelopeId, offset + i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // Address via "<agreementId>:<versionId>", as listDocuments returns it.
    // Walks List Agreement Versions, so the returned `order` is the same
    // position the list reports.
    const sep = id.indexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const versionId = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !versionId) {
      throw new Error('getDocument expects an id of shape "<agreementId>:<versionId>"')
    }
    const client = this.client(credentials)
    let cursor: string | undefined
    let offset = 0
    for (;;) {
      const page = await this.versionsPage(client, envelopeId, cursor)
      const at = page.items.findIndex((v) => v.id === versionId)
      if (at >= 0) return transformDocument(page.items[at], envelopeId, offset + at)
      if (!page.next || page.next === cursor) break
      offset += page.items.length
      cursor = page.next
    }
    throw Object.assign(
      new Error(`Agreement version ${versionId} not found on agreement ${envelopeId}`),
      { statusCode: 404 },
    )
  }

  // ── Audit-trail entries ─────────────────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(AUDIT_REFUSAL)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(AUDIT_REFUSAL)
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.templates ?? res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawLinksquaresTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
