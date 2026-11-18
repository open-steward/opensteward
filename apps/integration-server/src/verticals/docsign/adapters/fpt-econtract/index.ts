/**
 * FPT.eContract adapter.
 *
 * Maps FPT.eContract *contracts* (hợp đồng) → canonical `Envelope` (a
 * contract IS the envelope), its inline recipients → `Signer`, its file
 * manifest → `Document` (metadata only — content is REFUSED), its contract
 * history → `AuditTrailEntry`, and contract templates → `Template`.
 *
 * Auth is a static partner API key (`api-key` header) collected via the
 * Connect Link credential form; there is no OAuth flow, so
 * `getAuthUrl`/`exchangeCode` throw.
 *
 * Product: https://econtract.fpt.com.vn/
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { FORM } from './auth'
import { FptEcontractClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyFptEcontractWebhook, parseFptEcontractWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawFptEcontractContract,
} from './transform/envelope'
import {
  transformSigner,
  type RawFptEcontractRecipient,
} from './transform/signer'
import {
  transformDocument,
  type RawFptEcontractDocument,
} from './transform/document'
import {
  transformAuditTrailEntry,
  type RawFptEcontractHistoryEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawFptEcontractTemplate } from './transform/template'

export interface FptEcontractAdapterConfig {
  clientId: string
  /** Treated as the API key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Contract detail carries recipients, file manifest, and history inline. */
type ContractDetailResponse = RawFptEcontractContract & {
  recipients?: RawFptEcontractRecipient[]
  signers?: RawFptEcontractRecipient[]
  files?: RawFptEcontractDocument[]
  documents?: Array<{ id?: string | number; documentId?: string | number }>
  history?: RawFptEcontractHistoryEvent[]
}

/** FPT list endpoints wrap rows in `data` with `total`/`page`/`pageSize`. */
interface ContractListResponse {
  data?: RawFptEcontractContract[]
  total?: number
  page?: number
  pageSize?: number
}

interface TemplateListResponse {
  data?: RawFptEcontractTemplate[]
  total?: number
  page?: number
  pageSize?: number
}

export class FptEcontractAdapter implements DocsignAdapter {
  readonly platform = 'fpt-econtract'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

   
  private clientId: string
  private clientSecret: string
   
  private redirectUri: string
   
  private scopes: string[]

  constructor(config: FptEcontractAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('fpt-econtract uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('fpt-econtract uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFptEcontractWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFptEcontractWebhookEvents(payload)
  }

  private client(credentials: Credentials): FptEcontractClient {
    return new FptEcontractClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    if (params.search) out.keyword = String(params.search)
    return out
  }

  private async contractDetail(
    credentials: Credentials,
    id: string,
  ): Promise<ContractDetailResponse> {
    return this.client(credentials).get<ContractDetailResponse>(`/contracts/${id}`)
  }

  // ── Envelopes (contracts) ─────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<ContractListResponse>(
      '/contracts',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.contractDetail(credentials, id)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/contracts/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients on the contract) ──────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.contractDetail(credentials, envelopeId)
    const recipients = raw.recipients ?? raw.signers ?? []
    return recipients.map((r) => transformSigner(r, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('fpt-econtract getSigner expects an id of shape "<contractId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Recipient ${recipientId} not found on contract ${envelopeId}`)
    return found
  }

  // ── Documents (file manifest, metadata only — content REFUSED) ────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.contractDetail(credentials, envelopeId)
    const files = (raw.files ?? raw.documents ?? []) as RawFptEcontractDocument[]
    return files.map((f, i) => transformDocument(f, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('fpt-econtract getDocument expects an id of shape "<contractId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on contract ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (contract history) ────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<{ data?: RawFptEcontractHistoryEvent[] } & {
      history?: RawFptEcontractHistoryEvent[]
    }>(`/contracts/${envelopeId}/history`)
    const events = res.data ?? res.history ?? []
    return events.map((h, i) => transformAuditTrailEntry(h, envelopeId, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('fpt-econtract audit-trail id expects shape "<contractId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawFptEcontractTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
