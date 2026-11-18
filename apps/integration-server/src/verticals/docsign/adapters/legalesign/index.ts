/**
 * Legalesign adapter — UK e-signature platform (api.legalesign.com /
 * eu-api.legalesign.com, REST v1).
 *
 * Maps Legalesign documents → canonical `Envelope`, the document's
 * `signer_objects` → `Signer`, the composed signing PDF (metadata only) →
 * `Document`, and text + PDF templates → `Template`.
 *
 * Auth is a single long-lived API key (`username:secret`) supplied via the
 * `Authorization: ApiKey ...` header. The Connect Link flow collects the key
 * plus the account region (US/EU) via a custom form; there is no OAuth and no
 * token refresh.
 *
 * Legalesign exposes no per-event audit-trail JSON endpoint — only a binary
 * PDF audit log we deliberately do not surface — so `listAuditTrailEntries` /
 * `getAuditTrailEntry` are intentionally not implemented (the router returns
 * 501).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: audit-trail-entry — /document/{id}/auditlog/ returns a binary
 *   PDF only; there is no JSON endpoint for structured per-event audit data.
 *
 * Webhook deliveries are HMAC-SHA256 signed (`X-HMAC-SHA256` header), so the
 * adapter implements `verifyWebhook` + `parseWebhookEvents`.
 *
 * Signers and documents are both served from the single
 * `GET /document/{uuid}/` detail call — Legalesign nests those inside the
 * document rather than exposing standalone collections.
 */

import {
  connectionScope,
  customForm,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as legalesignExchange,
  refreshCredentials as legalesignRefresh,
} from './auth'
import { LegalesignClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, baseUrlForRegion } from './constants'
import { verifyLegalesignWebhook, parseLegalesignWebhookEvents } from './webhook'

import { transformEnvelope, type RawLegalesignDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawLegalesignTemplate } from './transform/template'
import type { ListMeta } from './transform/shared'

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'username:secret',
      helpText:
        'In the API Dashboard (https://logs.legalesign.com) copy your API key as "username:secret". It is sent on the Authorization header as "ApiKey username:secret".',
      required: true,
    },
    {
      name: 'region',
      label: 'Account region',
      type: 'select',
      helpText: 'Pick the region your Legalesign account is hosted in.',
      required: true,
      options: [
        { value: 'us', label: 'United States (api.legalesign.com)' },
        { value: 'eu', label: 'Europe (eu-api.legalesign.com)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const region = (fields['region'] ?? 'us').trim().toLowerCase()
    return { accessToken: apiKey, extra: { region } }
  },
})

interface TastypieList<T> {
  meta?: ListMeta
  objects?: T[]
}

export class LegalesignAdapter implements DocsignAdapter {
  readonly platform = 'legalesign'
  readonly version = '0.1.0'

  // Connect Link support — API key + region form (Legalesign has no OAuth).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return legalesignExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return legalesignRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLegalesignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLegalesignWebhookEvents(payload)
  }

  private client(credentials: Credentials): LegalesignClient {
    return new LegalesignClient(credentials)
  }

  /**
   * The size sent upstream: the caller's limit, clamped to `MAX_PAGE_SIZE`.
   * Legalesign's lists page by `limit` + `offset`
   * (https://github.com/legalesign/Legalesign-V1-OpenAPI3, legalesign-api-v1.yaml:
   * "Offset from start of dataset. Use with the limit query to iterate
   * through dataset."), so the offset strides by this size, never by a larger
   * caller limit.
   */
  private pageSize(params: QueryParams): number {
    return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  }

  /** One connection: the regional host plus the API key's fingerprint. */
  private scope(credentials: Credentials): string {
    const region = credentials.extra?.['region'] as string | undefined
    return connectionScope(`legalesign:${baseUrlForRegion(region)}`, credentials)
  }

  /** Filters shared by the list endpoints (everything but the position). */
  private listFilters(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params['status'] != null) out.status = params['status']
    if (params['archived'] != null) out.archived = String(params['archived'])
    if (params.updatedAfter instanceof Date) out.modified_gt = params.updatedAfter.toISOString()
    else if (params['modified_gt']) out.modified_gt = String(params['modified_gt'])
    return out
  }

  // ── Envelopes (Legalesign documents) ──────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    // The /document/ list requires a `group` filter. It accepts either a bare
    // group id or the full resource URI.
    const group = params['group'] ?? credentials.extra?.['group']
    const size = this.pageSize(params)
    const query = {
      offset: typeof params['offset'] === 'number' ? params['offset'] : pageOffset(params, size),
      limit: size,
      ...this.listFilters(params),
      ...(group ? { group: String(group) } : {}),
    }
    const res = await this.client(credentials).get<TastypieList<RawLegalesignDocument>>(
      '/document/',
      query,
    )
    // Tastypie's `meta.next` is null on the last page, and `total_count` is
    // the "total number of objects" (ListMeta in the same spec).
    const meta = res.meta
    reportUpstreamPage(params, {
      ...(meta && 'next' in meta ? { hasMore: meta.next != null } : {}),
      ...(typeof meta?.total_count === 'number' ? { totalCount: meta.total_count } : {}),
      ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
    })
    return (res.objects ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawLegalesignDocument>(`/document/${id}/`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    // DELETE /document/{id}/ sets status 40 (removed/voided) and archives it.
    // `email=1` notifies recipients the document was voided.
    await this.client(credentials).delete(`/document/${id}/`, { email: data?.reason ? 1 : 0 })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (signer_objects on the document detail) ───────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.allSigners(credentials, envelopeId), params)
  }

  /** Every signer: `GET /document/{docId}/` nests them all in `signer_objects`. */
  private async allSigners(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawLegalesignDocument>(
      `/document/${envelopeId}/`,
    )
    return (raw.signer_objects ?? []).map((s, i) => transformSigner(s, envelopeId, i))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Address via "<documentUuid>:<signerUuid>"; Legalesign nests signers in
    // the document detail rather than exposing a signer-by-id read.
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<documentUuid>:<signerUuid>"')
    }
    const all = await this.allSigners(credentials, envelopeId)
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (composed signing PDF — metadata only, content REFUSED) ─────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<RawLegalesignDocument>(
      `/document/${envelopeId}/`,
    )
    return pageLocally([transformDocument(raw)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // The composed PDF shares the document's uuid; accept "<uuid>" or
    // "<envelopeUuid>:<uuid>".
    const docId = id.includes(':') ? (id.split(':')[0] as string) : id
    const raw = await this.client(credentials).get<RawLegalesignDocument>(`/document/${docId}/`)
    return transformDocument(raw)
  }

  // ── Templates (text + PDF templates merged) ───────────────────────────────

  /**
   * Text templates then PDF templates, as one stream. Both endpoints page by
   * `limit` + `offset` and end on a null `meta.next`, so `pageByRows` walks
   * `/template/` to its end, then `/templatepdf/`, in upstream pages of
   * `MAX_PAGE_SIZE`, and cuts exactly the caller's rows out of them.
   *
   * The cursor is `<endpoint>:<offset>`. The key is per connection plus every
   * filter and the upstream page size; the caller's limit stays out.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const client = this.client(credentials)
    const filters = this.listFilters(params)
    if (params['group']) filters.group = String(params['group'])
    const key = cursorPagerKey(this.scope(credentials), 'templates', {
      ...filters,
      pageSize: MAX_PAGE_SIZE,
    })
    const result = await pageByRows<Template, string>(
      key,
      params,
      async (cursor): Promise<CursorPage<Template, string>> => {
        const [kind, at] = (cursor ?? 'text:0').split(':')
        const offset = Number(at)
        const request = client.get<TastypieList<RawLegalesignTemplate>>(
          kind === 'pdf' ? '/templatepdf/' : '/template/',
          { ...filters, offset, limit: MAX_PAGE_SIZE },
        )
        // An endpoint that fails on its FIRST page reads as empty, as before
        // (an account may lack one template kind). A failure further in is
        // rethrown: swallowing it would record the error as that endpoint's
        // end and skip its remaining rows for the rest of the walk.
        const res =
          offset === 0
            ? await request.catch(() => ({ objects: [] }) as TastypieList<RawLegalesignTemplate>)
            : await request
        const rows = res.objects ?? []
        const more =
          rows.length > 0 &&
          (res.meta && 'next' in res.meta ? res.meta.next != null : rows.length >= MAX_PAGE_SIZE)
        const next = more ? `${kind}:${offset + rows.length}` : kind === 'pdf' ? undefined : 'pdf:0'
        return { items: rows.map(transformTemplate), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const client = this.client(credentials)
    // Try the PDF template first (the most common kind), fall back to text.
    try {
      const pdf = await client.get<RawLegalesignTemplate>(`/templatepdf/${id}/`)
      return transformTemplate(pdf)
    } catch {
      const text = await client.get<RawLegalesignTemplate>(`/template/${id}/`)
      return transformTemplate(text)
    }
  }
}
