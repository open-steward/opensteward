/**
 * DigiSigner adapter. Static API key, sent as HTTP Basic auth.
 *
 * DigiSigner's API reference
 * (https://www.digisigner.com/esignature-api/esignature-api-documentation/)
 * documents one JSON read, "Get Signature Request Status":
 *   GET https://api.digisigner.com/v1/signature_requests/{signature_request_id}
 * which "Requires a signature_request_id". It has no list endpoint and no
 * paging parameter, so:
 *   signature requests → Envelope  (get only; listing is REFUSED)
 *   documents[].signers[] → Signer (paged locally over the request's signers)
 *   documents[]         → Document (paged locally; metadata only)
 *   audit trail         → REFUSED  (no audit endpoint)
 *   templates           → REFUSED  (configured in the dashboard, no endpoint)
 */
import { pageLocally } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as digisignerCredentialFields,
  exchangeCredentials as digisignerExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { DigiSignerClient } from './client'
import { verifyDigiSignerWebhook, parseDigiSignerWebhookEvents } from './webhook'

import {
  sendsEmails,
  transformEnvelope,
  type RawDigiSignerSignatureRequest,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { requireDocumentId, transformDocument } from './transform/document'

export interface DigiSignerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const ENVELOPE_LIST_REFUSAL =
  'DigiSigner cannot list envelopes: its API reference documents no list endpoint; the only ' +
  'signature request read is "Get Signature Request Status", which "Requires a signature_request_id"'

const AUDIT_REFUSAL =
  'DigiSigner cannot list audit trail entries: its API reference documents no audit endpoint; ' +
  '"Get Signature Request Status" reports only is_completed and per-signer is_signature_completed'

const TEMPLATE_REFUSAL =
  'DigiSigner cannot list templates: its API has no template endpoint; templates are uploaded ' +
  '"via DigiSigner dashboard" and the template id is read from "your browser address bar"'

export class DigiSignerAdapter implements DocsignAdapter {
  readonly platform = 'digisigner'
  readonly version = '0.1.0'

  constructor(_config: DigiSignerAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('digisigner uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return digisignerCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return digisignerExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDigiSignerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDigiSignerWebhookEvents(payload)
  }

  private client(credentials: Credentials): DigiSignerClient {
    return new DigiSignerClient(credentials)
  }

  /** GET /v1/signature_requests/{signature_request_id} — the one documented JSON read. */
  private async getSignatureRequest(
    credentials: Credentials,
    signatureRequestId: string,
  ): Promise<RawDigiSignerSignatureRequest> {
    return this.client(credentials).get<RawDigiSignerSignatureRequest>(
      `/signature_requests/${encodeURIComponent(signatureRequestId)}`,
    )
  }

  // ── Envelopes (signature requests) ─────────────────────────────────────────

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported(ENVELOPE_LIST_REFUSAL)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.getSignatureRequest(credentials, id))
  }

  /** Write path, out of scope for the read rebuild: `/transactions/{id}/cancel` is not in the API reference. */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/transactions/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (documents[].signers[]) ────────────────────────────────────────

  private async allSigners(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const raw = await this.getSignatureRequest(credentials, envelopeId)
    // The id the caller asked for is the id in the documented path.
    const id = envelopeId
    const emails = sendsEmails(raw)
    const out: Signer[] = []
    for (const doc of raw.documents ?? []) {
      const docId = requireDocumentId(doc, id)
      for (const s of doc.signers ?? []) out.push(transformSigner(s, id, docId, emails))
    }
    return out
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.allSigners(credentials, envelopeId), params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [signatureRequestId, docId, ...rest] = id.split(':')
    const email = rest.join(':')
    if (!signatureRequestId || !docId || !email) {
      throw new Error('digisigner getSigner expects an id of shape "<signatureRequestId>:<documentId>:<email>"')
    }
    const found = (await this.allSigners(credentials, signatureRequestId)).find((s) => s.id === id)
    if (!found) throw new Error(`digisigner signer ${id} not found`)
    return found
  }

  // ── Documents (documents[]; metadata only) ─────────────────────────────────

  private async allDocuments(credentials: Credentials, envelopeId: string): Promise<Document[]> {
    const raw = await this.getSignatureRequest(credentials, envelopeId)
    const id = envelopeId
    return (raw.documents ?? []).map((d, i) => transformDocument(d, id, i))
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return pageLocally(await this.allDocuments(credentials, envelopeId), params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [signatureRequestId, docId, extra] = id.split(':')
    if (!signatureRequestId || !docId || extra !== undefined) {
      throw new Error('digisigner getDocument expects an id of shape "<signatureRequestId>:<documentId>"')
    }
    const found = (await this.allDocuments(credentials, signatureRequestId)).find((d) => d.id === id)
    if (!found) throw new Error(`digisigner document ${id} not found`)
    return found
  }

  // ── Audit trail (REFUSED) ──────────────────────────────────────────────────

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

  // ── Templates (REFUSED) ────────────────────────────────────────────────────

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported(TEMPLATE_REFUSAL)
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported(TEMPLATE_REFUSAL)
  }
}
