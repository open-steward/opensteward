/**
 * Juro adapter.
 *
 * Juro is a contract-automation platform; its REST API (v3) models a
 * *contract* as the unit of work. We map a Juro contract onto the canonical
 * Envelope, its nested `signingSides[].signatures[]` onto Signers, the
 * contract itself onto a single metadata-only Document, and Juro templates
 * onto canonical Templates.
 *
 * Auth: static API key in the `x-api-key` header (no OAuth) — collected via
 * the shared `simpleApiKey` Connect Link form.
 *
 * Not supported (auto-501): audit-trail entries — Juro exposes no audit /
 * timeline / history endpoint; lifecycle is delivered via webhooks instead.
 *
 * Refused at the firewall: contract PDF content
 * (`GET /v3/contracts/:id/pdf/binary`) is never read.
 *
 * Docs: https://api-docs.juro.com/
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: audit-trail-entry — Juro v3 REST API exposes no audit/timeline/
//   history endpoint; contract lifecycle events are delivered exclusively via
//   webhooks.
// ──────────────────────────────────────────────────────────────────────────────

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import { simpleApiKey, pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { JuroClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyJuroWebhook, parseJuroWebhookEvents } from './webhook'

import { transformEnvelope, type RawJuroContract } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawJuroTemplate } from './transform/template'

export interface JuroAdapterConfig {
  clientId?: string
  /** Treated as the API key when no OAuth flow exists. */
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

interface ContractsListResponse {
  total?: number
  contracts?: RawJuroContract[]
}

interface ContractWrapper {
  contract?: RawJuroContract
}

interface TemplatesListResponse {
  total?: number
  templates?: RawJuroTemplate[]
}

interface TemplateWrapper {
  template?: RawJuroTemplate
}

const apiKeyForm = simpleApiKey({
  fieldName: 'apiKey',
  label: 'Juro API key',
  placeholder: 'juro_...',
  helpText:
    'In Juro, open Settings → Integrations → API & webhooks → API and click "Generate API key". Sent as the x-api-key header.',
})

export class JuroAdapter implements DocsignAdapter {
  readonly platform = 'juro'
  readonly version = '0.1.0'
  /** `GET /v3/contracts`: "limit … Number of contracts to return (max 200)". */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private apiKey: string

  constructor(config: JuroAdapterConfig = {}) {
    // Juro is API-key only; the orchestrator may pass the key as clientSecret.
    this.apiKey = config.clientSecret ?? ''
  }

  // ── Auth (API key only) ────────────────────────────────────────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('juro uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('juro uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return apiKeyForm.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    if (!fields.apiKey && this.apiKey) {
      return { accessToken: this.apiKey }
    }
    return apiKeyForm.exchangeCredentials(fields)
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyJuroWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseJuroWebhookEvents(payload)
  }

  private client(credentials: Credentials): JuroClient {
    return new JuroClient(credentials)
  }

  /**
   * `GET /v3/contracts` pages by offset: `skip` rows, then `limit` of them
   * (default 50, max 200). The caller's 1-based page strides by the size
   * actually sent, so a clamped limit never skips rows.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const wanted = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
    const limit = Math.min(wanted, MAX_PAGE_SIZE)
    const out: Record<string, unknown> = {
      skip: pageOffset(params, limit),
      limit,
    }
    if (params['updated_after']) out.updatedSince = String(params['updated_after'])
    else if (params.updatedAfter instanceof Date) {
      out.updatedSince = params.updatedAfter.toISOString()
    }
    if (params['templateId']) out.templateId = String(params['templateId'])
    return out
  }

  // ── Envelopes (contracts) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const query = this.listParams(params)
    const res = await this.client(credentials).get<ContractsListResponse>('/contracts', query)
    const rows = res.contracts ?? []
    const skip = query.skip as number
    const limit = query.limit as number
    // `total` is "Total number of contracts matching the filter (before
    // pagination)", so the end is known exactly; without it, a short page ends.
    reportUpstreamPage(params, {
      hasMore:
        typeof res.total === 'number' ? skip + rows.length < res.total : rows.length >= limit,
      ...(typeof res.total === 'number' ? { totalCount: res.total } : {}),
      ...(typeof params.limit === 'number' && limit < params.limit ? { pageSize: limit } : {}),
    })
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<ContractWrapper | RawJuroContract>(
      `/contracts/${id}`,
    )
    const raw = (res as ContractWrapper).contract ?? (res as RawJuroContract)
    return transformEnvelope(raw)
  }

  /**
   * Juro has no "void" verb; DELETE removes the contract. We delete, then
   * return a synthetic voided envelope (a subsequent GET would 404).
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).delete(`/contracts/${id}`)
    return transformEnvelope({ id, status: 'rejected' })
  }

  // ── Signers (signingSides → signatures) ──────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /v3/contracts/:contract_id takes only the id and returns every
    // signing side, so the caller's page is cut from the flattened rows.
    const res = await this.client(credentials).get<ContractWrapper | RawJuroContract>(
      `/contracts/${envelopeId}`,
    )
    const raw = (res as ContractWrapper).contract ?? (res as RawJuroContract)
    const out: Signer[] = []
    for (const side of raw.signingSides ?? []) {
      for (const sig of side.signatures ?? []) {
        out.push(transformSigner(side, sig, envelopeId, raw.status))
      }
    }
    return pageLocally(out, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Signer ids are `<envelopeId>:<signingSideUid>:<signatureKey>`; the
    // envelope id is the first segment.
    const segments = id.split(':')
    if (segments.length < 2) {
      throw new Error(
        'juro getSigner expects an id of shape "<envelopeId>:<signingSideUid>:<signatureKey>"',
      )
    }
    const envelopeId = segments[0] as string
    const externalId = segments.slice(1).join(':')
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === externalId)
    if (!found) throw new Error(`juro signer ${externalId} not found on contract ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — PDF content REFUSED) ──────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // One synthesised document per contract; paged like any whole list.
    const res = await this.client(credentials).get<ContractWrapper | RawJuroContract>(
      `/contracts/${envelopeId}`,
    )
    const raw = (res as ContractWrapper).contract ?? (res as RawJuroContract)
    return pageLocally([transformDocument(raw, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const envelopeId = id.includes(':') ? (id.split(':')[0] as string) : id
    const res = await this.client(credentials).get<ContractWrapper | RawJuroContract>(
      `/contracts/${envelopeId}`,
    )
    const raw = (res as ContractWrapper).contract ?? (res as RawJuroContract)
    return transformDocument(raw, envelopeId)
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    // GET /v3/templates documents no query parameter ("You first want to get
    // all templates"): the reply is the whole list, paged here.
    const res = await this.client(credentials).get<TemplatesListResponse>('/templates')
    return pageLocally((res.templates ?? []).map(transformTemplate), params)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<TemplateWrapper | RawJuroTemplate>(
      `/templates/${id}`,
    )
    const raw = (res as TemplateWrapper).template ?? (res as RawJuroTemplate)
    return transformTemplate(raw)
  }
}
