/**
 * Sirion (SirionOne) docsign adapter.
 *
 * SirionOne is an AI-native Contract Lifecycle Management platform. Its B2B
 * API is a tenant-scoped REST API authenticated with the OAuth 2.0
 * client-credentials grant (OAuth Client ID + Secret minted under Admin 2.0).
 * In canonical docsign terms a SirionOne *contract* is the envelope; its
 * nested signatories are signers, its attached files are documents, its
 * activity history is the audit trail, and contract templates are templates.
 *
 * Read-only surface: envelopes (list/get), signers, documents (metadata
 * only), audit-trail entries, and templates. SirionOne's contract-termination
 * (void) and signature mutations are governance-workflow driven and not part
 * of the documented read-oriented B2B surface, so write methods are left
 * unimplemented and auto-501.
 *
 * No public webhook signature scheme is documented, so this adapter exposes
 * no webhook verification.
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  credentialFields as sirionCredentialFields,
  exchangeCredentials as sirionExchangeCredentials,
  refreshCredentials as sirionRefresh,
} from './auth'
import { SirionClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawSirionContract } from './transform/envelope'
import { transformSigner, type RawSirionSignatory } from './transform/signer'
import { transformDocument, type RawSirionDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSirionActivity,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawSirionTemplate } from './transform/template'

export interface SirionAdapterConfig {
  /** Optional default client ID for instance-config callers. */
  clientId?: string
  /** Optional default client secret for instance-config callers. */
  clientSecret?: string
  /** Per-tenant SirionOne host, e.g. https://acme.sirion.ai. */
  baseUrl?: string
  scopes?: string[]
}

/** SirionOne wraps list payloads in a Spring-style page object. */
interface PageResponse<T> {
  content?: T[]
  totalElements?: number
  totalPages?: number
  number?: number
}

interface ContractDetail extends RawSirionContract {
  signatories?: RawSirionSignatory[]
  documents?: RawSirionDocument[]
}

interface ActivityResponse {
  content?: RawSirionActivity[]
  activities?: RawSirionActivity[]
}

export class SirionAdapter implements DocsignAdapter {
  readonly platform = 'sirion'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config: SirionAdapterConfig = {}) {
    // No OAuth client configuration required; credentials are collected via
    // the Connect form (credentialFields / exchangeCredentials).
  }

  // ── Connect-form credential entry (preferred for new connections) ──────────

  credentialFields(): CredentialField[] {
    return sirionCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sirionExchangeCredentials(fields)
  }

  // ── Auth (OAuth redirect — not used; Sirion is client-credentials only) ───

  /**
   * SirionOne uses the OAuth 2.0 client-credentials grant — there is no
   * interactive authorization URL. Use `credentialFields()` /
   * `exchangeCredentials()` instead.
   */
  getAuthUrl(): string {
    throw new Error(
      'Sirion uses client-credentials auth; use credentialFields()/exchangeCredentials() instead.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Sirion uses client-credentials auth; use credentialFields()/exchangeCredentials() instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return sirionRefresh(credentials)
  }

  private client(credentials: Credentials): SirionClient {
    return new SirionClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: typeof params.page === 'number' ? params.page : 0,
      size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.search) out.query = String(params.search)
    if (params['status']) out.status = String(params['status'])
    if (params.updatedAfter instanceof Date) out.modifiedAfter = params.updatedAfter.toISOString()
    return out
  }

  // ── Envelopes (contracts) ──────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<PageResponse<RawSirionContract>>(
      '/contracts',
      this.listParams(params),
    )
    return (res.content ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<ContractDetail>(`/contracts/${id}`)
    return transformEnvelope(raw)
  }

  // ── Signers (signatories) ──────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.client(credentials).get<ContractDetail>(`/contracts/${envelopeId}`)
    return (raw.signatories ?? []).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signatoryId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signatoryId) {
      throw new Error('getSigner expects an id of shape "<contractId>:<signatoryId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signatoryId)
    if (!found) throw new Error(`Signatory ${signatoryId} not found on contract ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<ContractDetail>(`/contracts/${envelopeId}`)
    return (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<contractId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on contract ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (contract activity history) ─────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<ActivityResponse>(
      `/contracts/${envelopeId}/activities`,
    )
    const rows = res.content ?? res.activities ?? []
    return rows.map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<contractId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (contract templates) ──────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<PageResponse<RawSirionTemplate>>(
      '/contract-templates',
      this.listParams(params),
    )
    return (res.content ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSirionTemplate>(`/contract-templates/${id}`)
    return transformTemplate(raw)
  }
}
