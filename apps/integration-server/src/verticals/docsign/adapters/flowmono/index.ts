/**
 * Flowmono eSign adapter.
 *
 * Maps the Flowmono signing-request REST API to the canonical docsign schema.
 * Covers signing requests (envelopes), recipients (signers), documents
 * (metadata only — binary content never requested), and recipient action
 * logs (audit-trail entries). Templates are not supported by the current
 * Flowmono API.
 *
 * Auth: Bearer token (static API key) + appId / apiClientId / subscriberId /
 * userId credentials collected via the Connect Link credential form.
 *
 * Base URL: https://api.flowmono.com
 * Swagger:  https://api.flowmono.com/swagger/v1/swagger.json
 * Docs:     https://www.flowmono.com/en-US/api/e-sign
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { WebhookEvent } from '../../schema/webhook'

import { FORM } from './auth'
import { FlowmonoClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyFlowmonoWebhook, parseFlowmonoWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawFlowmonoSigningRequest,
} from './transform/envelope'
import { transformSigner, type RawFlowmonoRecipient } from './transform/signer'
import { transformDocument, type RawFlowmonoDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawFlowmonoActionLog,
} from './transform/audit-trail-entry'

export interface FlowmonoAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/** Wrapper for Result.entity when it carries a list of signing requests. */
interface SigningRequestListResult {
  succeeded?: boolean
  entity?: RawFlowmonoSigningRequest[] | RawFlowmonoSigningRequest | null
  message?: string
}

/** Wrapper for Result.entity when it carries a single signing request. */
interface SigningRequestResult {
  succeeded?: boolean
  entity?: RawFlowmonoSigningRequest | null
  message?: string
}

/** Wrapper for Result.entity when it carries a list of recipients. */
interface RecipientListResult {
  succeeded?: boolean
  entity?: RawFlowmonoRecipient[] | null
  message?: string
}

/** Wrapper for Result.entity when it carries a document record. */
interface DocumentResult {
  succeeded?: boolean
  entity?: RawFlowmonoDocument | null
  message?: string
}

/** Wrapper for Result.entity when it carries audit logs. */
interface ActionLogListResult {
  succeeded?: boolean
  entity?: RawFlowmonoActionLog[] | null
  message?: string
}

export class FlowmonoAdapter implements DocsignAdapter {
  readonly platform = 'flowmono'
  readonly version = '0.1.0'

  constructor(_config?: FlowmonoAdapterConfig) {
    // Config is unused — credentials are collected via the Connect Link form.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'flowmono uses static API key credentials; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'flowmono uses static API key credentials; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API key — nothing to refresh.
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFlowmonoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFlowmonoWebhookEvents(payload)
  }

  private client(credentials: Credentials): FlowmonoClient {
    return new FlowmonoClient(credentials)
  }

  // ── Envelopes (signing requests) ─────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const cl = this.client(credentials)
    const res = await cl.post<SigningRequestListResult>(
      '/api/ExternalApplication/getapisigningrequestsbyappid',
      {
        appId: cl.ctx.appId,
        apiClientId: cl.ctx.apiClientId,
        token: cl.ctx.token,
        subscriberId: cl.ctx.subscriberId,
        userId: cl.ctx.userId,
        skip: 0,
        take: params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )
    const entity = res.entity
    const list: RawFlowmonoSigningRequest[] = Array.isArray(entity)
      ? entity
      : entity
        ? [entity]
        : []
    return list.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<SigningRequestResult>(
      `/api/ExternalApplication/getsigningrequestbyreferencenumber/${encodeURIComponent(id)}`,
    )
    const raw = res.entity ?? {}
    return transformEnvelope(raw as RawFlowmonoSigningRequest)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Flowmono does not expose a void/cancel endpoint in the public API.
    // Return the current envelope state.
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients) ──────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<RecipientListResult>(
      `/api/ExternalApplication/getsigningrequestrecipientsbyreferencenumber/${encodeURIComponent(envelopeId)}`,
    )
    const list = res.entity ?? []
    return (Array.isArray(list) ? list : [list]).map((r) =>
      transformSigner(r as RawFlowmonoRecipient, envelopeId),
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error('getSigner expects an id of shape "<referenceNumber>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId || s.id === id)
    if (!found) throw new Error(`Flowmono signer ${id} not found on signing request ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<DocumentResult>(
      `/api/ExternalApplication/getsigningrequestdocumentbyclientreference/${encodeURIComponent(envelopeId)}`,
    )
    const entity = res.entity
    if (!entity) return []
    const list = Array.isArray(entity) ? entity : [entity]
    return (list as RawFlowmonoDocument[]).map((d) => transformDocument(d, envelopeId))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, docId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error('getDocument expects an id of shape "<referenceNumber>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === docId || d.id === id)
    if (!found) throw new Error(`Flowmono document ${id} not found on signing request ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries ───────────────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const cl = this.client(credentials)
    const res = await cl.post<ActionLogListResult>(
      '/api/RecipientActionLog/getrecipientactionlogs',
      {
        subscriberId: cl.ctx.subscriberId,
        userId: cl.ctx.userId,
        searchValue: envelopeId,
        skip: 0,
        take: params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )
    const list = res.entity ?? []
    return (Array.isArray(list) ? list : [list]).map((entry, i) =>
      transformAuditTrailEntry(entry as RawFlowmonoActionLog, envelopeId, i),
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error(
        'getAuditTrailEntry expects an id of shape "<referenceNumber>:<index>"',
      )
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Flowmono audit entry ${id} not found`)
    return found
  }
}
