/**
 * SigniFlow adapter.
 *
 * SigniFlow's "PowerFlow" JSON/REST API models a signing job as a *document*
 * carrying a *workflow* of worksteps. The document is the canonical Envelope,
 * its worksteps are the Signers, and the same document payload yields the
 * single metadata-only Document.
 *
 * Auth: POST /Login with UserNameField/PasswordField returns a TokenField
 * object that is embedded in the JSON body of every subsequent call.
 * There is no auth header.
 *
 * Endpoint notes:
 * - Document fetch: POST /GetDoc (DocIDField + TokenField)
 * - Cancel workflow: POST /CancelFlow (DocIDField + ReasonField + TokenField)
 * - Document audit: POST /GetDocumentAudit (DocIDField + TokenField) —
 *   returns ActivityField array with real per-event records
 * - Templates: POST /GetPrepperTemplateList / /GetPrepperTemplate /
 *   /ApplyPrepperTemplate
 * - No list-documents endpoint exists in the SigniFlow API; listEnvelopes
 *   is not implemented (router returns 501).
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  credentialFields as signiflowCredentialFields,
  exchangeCredentials as signiflowExchangeCredentials,
  refreshLogin,
} from './auth'
import { SigniFlowClient } from './client'

import {
  transformEnvelope,
  type RawSigniFlowDocument,
  type RawSigniFlowWorkStep,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
} from './transform/audit-trail-entry'
import { pickStr, toIso } from './transform/shared'
import {
  transformTemplateInfo,
  type RawSigniFlowTemplateInfo,
} from './transform/template'

export interface SigniFlowAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Response shape for POST /GetDoc */
interface GetDocResponse {
  DocField?: string
  DocNameField?: string
  ExtensionField?: string
  ResultField?: string
}

/** A single activity entry from POST /GetDocumentAudit */
interface AuditActivity {
  ActionOrderField?: string
  AdditionalField?: string
  DocIDField?: string
  EmailField?: string
  EventDateField?: string
  EventField?: string
  EventStatusField?: string
  LocationField?: string
  OrderDateField?: string
  PageField?: string
  UserFullNameField?: string
  [key: string]: unknown
}

/** Response shape for POST /GetDocumentAudit */
interface GetDocumentAuditResponse {
  ActivityField?: AuditActivity[]
  ResultField?: string
}

/** Response shape for POST /GetPrepperTemplateList */
interface GetPrepperTemplateListResponse {
  TemplateInformationValuesField?: RawSigniFlowTemplateInfo[]
  ResultField?: string
}

function workSteps(raw: RawSigniFlowDocument): RawSigniFlowWorkStep[] {
  return raw.WorkSteps ?? raw.Workflow ?? []
}

export class SigniflowAdapter implements DocsignAdapter {
  readonly platform = 'signiflow'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SigniFlowAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    void this.clientId
    void this.redirectUri
    void this.scopes
    throw new Error('signiflow uses username/password login; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('signiflow uses username/password login; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-login using stored username/password to obtain a fresh token.
    try {
      return await refreshLogin(credentials)
    } catch {
      return credentials
    }
  }

  credentialFields(): CredentialField[] {
    return signiflowCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    if (!fields.username && this.clientSecret) {
      // Legacy path: treat clientSecret as a pre-obtained token.
      return { accessToken: this.clientSecret }
    }
    return signiflowExchangeCredentials(fields)
  }

  private client(credentials: Credentials): SigniFlowClient {
    return new SigniFlowClient(credentials)
  }

  // ── Envelopes ────────────────────────────────────────────────────────────
  // SigniFlow has no list-documents endpoint; listEnvelopes is not implemented.

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchDocument(credentials, id)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post('/CancelFlow', {
      DocIDField: id,
      ReasonField: data?.reason ?? 'Cancelled via API',
    })
    return this.getEnvelope(credentials, id)
  }

  private async fetchDocument(
    credentials: Credentials,
    id: string,
  ): Promise<RawSigniFlowDocument> {
    const res = await this.client(credentials).post<GetDocResponse>('/GetDoc', {
      DocIDField: Number(id),
    })
    // /GetDoc returns document content (DocField, base64) + metadata.
    // We synthesise a RawSigniFlowDocument from the metadata fields.
    if (!res.DocNameField && !res.DocField) {
      throw new Error(`SigniFlow document ${id} not found`)
    }
    const raw: RawSigniFlowDocument = {
      DocID: id,
      DocName: res.DocNameField,
      DocExtension: res.ExtensionField,
    }
    return raw
  }

  // ── Signers (worksteps) ───────────────────────────────────────────────────
  // SigniFlow's /GetDoc does not return worksteps. Signer listing requires
  // the workflow creation response or /GetDocStatus. listSigners returns an
  // empty array (the router does not 501 — callers see an empty list).

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.fetchDocument(credentials, envelopeId)
    return workSteps(raw).map((w, i) => transformSigner(w, envelopeId, i))
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.fetchDocument(credentials, envelopeId)
    return [transformDocument(raw, envelopeId)]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const envelopeId = id.includes(':') ? (id.split(':')[0] as string) : id
    const raw = await this.fetchDocument(credentials, envelopeId)
    return transformDocument(raw, envelopeId)
  }

  // ── Audit-trail entries (from POST /GetDocumentAudit) ─────────────────────
  // GetDocumentAudit takes only DocIDField + TokenField and returns the whole
  // ActivityField array: there is no upstream page, so the caller's page is
  // cut from the whole audit (the ids are global indexes into it).

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.fetchAuditTrail(credentials, envelopeId), params)
  }

  private async fetchAuditTrail(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).post<GetDocumentAuditResponse>(
      '/GetDocumentAudit',
      { DocIDField: envelopeId },
    )
    const activities = res.ActivityField ?? []

    return activities.map((act, i) => {
      const occurredAt = toIso(act.EventDateField ?? act.OrderDateField)
      const eventType = mapAuditEventType(pickStr(act.EventField))
      return transformAuditTrailEntry(
        {
          envelopeId,
          occurredAt: occurredAt ?? new Date(0).toISOString(),
          type: eventType,
          description: pickStr(act.EventField) ?? pickStr(act.EventStatusField) ?? 'Event',
          actorEmail: pickStr(act.EmailField),
          actorName: pickStr(act.UserFullNameField),
        },
        i,
        act,
      )
    })
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('SigniFlow audit-trail id expects shape "<documentId>:<index>"')
    }
    const all = await this.fetchAuditTrail(credentials, envelopeId)
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`SigniFlow audit entry ${id} not found`)
    return found
  }

  // ── Templates (POST /GetPrepperTemplateList) ──────────────────────────────
  // GetPrepperTemplateList takes only TemplateFolderField + TokenField and
  // returns the whole TemplateInformationValuesField array: the caller's page
  // is cut from it locally.

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).post<GetPrepperTemplateListResponse>(
      '/GetPrepperTemplateList',
      { TemplateFolderField: 0 },
    )
    const items = res.TemplateInformationValuesField ?? []
    return pageLocally(items.map(transformTemplateInfo), params)
  }
}

import type { AuditTrailEventType } from '../../schema/audit-trail-entry'

function mapAuditEventType(event: string | undefined): AuditTrailEventType {
  const e = (event ?? '').toLowerCase()
  if (e.includes('creat') || e.includes('upload') || e.includes('initiat')) return 'created'
  if (e.includes('sent') || e.includes('send') || e.includes('forward')) return 'sent'
  if (e.includes('view') || e.includes('open') || e.includes('deliver')) return 'viewed'
  if (e.includes('sign') || e.includes('complet') || e.includes('finish')) return 'signed'
  if (e.includes('declin') || e.includes('reject')) return 'declined'
  if (e.includes('cancel') || e.includes('void') || e.includes('remov')) return 'voided'
  if (e.includes('expir')) return 'expired'
  return 'created'
}
