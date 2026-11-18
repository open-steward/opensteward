/**
 * Ironclad CLM adapter.
 *
 * Maps Ironclad's contract-workflow model onto the canonical docsign schema:
 *   • Envelope ← workflow (`/workflows`, `/workflows/{id}`); void = cancel.
 *   • Signer   ← the workflow sign-status `signers[]`
 *                (`/workflows/{id}/sign-status`).
 *   • Document ← `/workflows/{id}/documents` (metadata only — the download
 *                href is dropped at the transform layer).
 *
 * Audit-trail entries and templates are intentionally NOT implemented:
 * Ironclad's audit trail is delivered exclusively over webhooks (no
 * per-workflow audit REST read), and templates have no public list/retrieve
 * read endpoint. The router returns 501 for those resources.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: audit-trail-entry — no REST read endpoint; audit events are
 *   delivered only via SIEM streaming (Security & Data Pro add-on). The
 *   /workflows/{id}/turn-history endpoint tracks ownership turns, not signing
 *   audit events.
 * Unavailable: template — no public endpoint to list or retrieve templates.
 *   /workflow-schemas returns launch-form field definitions, not reusable
 *   signing template resources.
 *
 * Webhook verification is also omitted: Ironclad signs deliveries with
 * asymmetric keys fetched from `/webhooks/verification-key`, which cannot be
 * checked against a single static shared secret, so this adapter does not
 * claim synchronous webhook verification.
 *
 * Docs: https://developer.ironcladapp.com/
 */

import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import {
  buildAuthUrl,
  exchangeCode as ironcladExchange,
  refreshCredentials as ironcladRefresh,
} from './auth'
import { IroncladClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawIroncladWorkflow } from './transform/envelope'
import { transformSigner, type RawIroncladSigner } from './transform/signer'
import { transformDocument, type RawIroncladDocument } from './transform/document'

export interface IroncladAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  /**
   * Deployment-wide region (na1, eu1, demo). Optional: the region is normally
   * the customer's, collected at connect time (`oauthFields`) and read back
   * from `credentials.extra.region`.
   */
  region?: string
}

interface WorkflowListResponse {
  page?: number
  pageSize?: number
  count?: number
  list?: RawIroncladWorkflow[]
}

interface SignStatusResponse {
  status?: string
  routing?: string
  provider?: string
  signers?: RawIroncladSigner[]
}

interface DocumentsResponse {
  signaturePacketDocuments?: RawIroncladDocument[]
  excludedFromSignaturePacketDocuments?: RawIroncladDocument[]
}

export class IroncladAdapter implements DocsignAdapter {
  readonly platform = 'ironclad'
  readonly version = '0.1.0'
  /**
   * `/workflows` takes `pageSize` 1..100
   * (https://developer.ironcladapp.com/reference/list-all-workflows); signers
   * and documents are whole replies paged locally.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private region: string | undefined

  constructor(config: IroncladAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.region = config.region
  }

  /**
   * Authorize, token and API endpoints all live on the customer's regional
   * host, which deployment config cannot know. Asked for before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'region',
        label: 'Ironclad region',
        type: 'select',
        required: true,
        options: [
          { value: 'na1', label: 'North America (na1)' },
          { value: 'eu1', label: 'Europe (eu1)' },
          { value: 'demo', label: 'Demo (demo)' },
        ],
        helpText:
          'Where your Ironclad account is hosted: na1 if you sign in at ironcladapp.com, eu1 for eu1.ironcladapp.com, demo for demo.ironcladapp.com.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['region'] ?? this.region,
    )
  }

  /** Exchange on the customer's region and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return ironcladExchange(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['region'] ?? this.region,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return ironcladExchange(code, redirectUri, this.clientId, this.clientSecret, this.region)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ironcladRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): IroncladClient {
    return new IroncladClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    // Ironclad's `page` is zero-based; ours is 1-based.
    const out: Record<string, unknown> = {
      page: Math.max(1, Math.floor(Number(params.page ?? 1)) || 1) - 1,
      pageSize: this.pageSize(params),
    }
    if (params['updated_after']) out.lastUpdated = String(params['updated_after'])
    else if (params.updatedAfter instanceof Date) {
      out.lastUpdated = params.updatedAfter.toISOString()
    }
    if (params['status']) out.status = String(params['status'])
    return out
  }

  /** The caller's limit, clamped to Ironclad's documented 1..100. */
  private pageSize(params: QueryParams): number {
    const limit = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    return Math.min(Math.max(Number.isFinite(limit) ? limit : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  }

  // ── Envelopes (workflows) ─────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const query = this.listParams(params)
    const res = await this.client(credentials).get<WorkflowListResponse>('/workflows', query)
    const list = res.list ?? []
    const page = query['page'] as number
    const pageSize = query['pageSize'] as number
    // `count` is the total across ALL pages, so the end is exact.
    reportUpstreamPage(params, {
      pageSize,
      ...(typeof res.count === 'number'
        ? { totalCount: res.count, hasMore: (page + 1) * pageSize < res.count }
        : { hasMore: list.length >= pageSize }),
    })
    return list.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawIroncladWorkflow>(`/workflows/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    // Ironclad cancels an in-flight workflow via POST /workflows/{id}/cancel
    // with a { comment } body. Returns 204 No Content.
    // Ref: https://developer.ironcladapp.com/reference/cancel-a-workflow
    await this.client(credentials).post(`/workflows/${id}/cancel`, {
      comment: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (sign-status) ─────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // sign-status takes only the path id and returns every signer: page locally.
    let signers: RawIroncladSigner[]
    try {
      const res = await this.client(credentials).get<SignStatusResponse>(
        `/workflows/${envelopeId}/sign-status`,
      )
      signers = res.signers ?? []
    } catch {
      // Workflows that have not reached the Sign step have no sign-status.
      signers = []
    }
    return pageLocally(
      signers.map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on workflow ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<DocumentsResponse>(
      `/workflows/${envelopeId}/documents`,
    )
    const out: Document[] = []
    let order = 0
    for (const raw of res.signaturePacketDocuments ?? []) {
      out.push(transformDocument(raw, envelopeId, order++, true))
    }
    for (const raw of res.excludedFromSignaturePacketDocuments ?? []) {
      out.push(transformDocument(raw, envelopeId, order++, false))
    }
    // /documents takes only the path id and returns every document: page locally.
    return pageLocally(out, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentKey] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentKey) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<documentKey>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentKey)
    if (!found) throw new Error(`Document ${documentKey} not found on workflow ${envelopeId}`)
    return found
  }
}
