/**
 * InfoCert adapter (Italian eIDAS QTSP), on the GoSign5 REST API.
 *
 * Source: the GoSign5 OpenAPI ("GoSign5 API (Preview)", 5.0.PREVIEW),
 * https://devportal.infocert.digital/gosign/documentation/GoSign5, served raw as
 * `specs/GoSign5.yaml` by https://devportal.infocert.digital:8443/gosign/files.
 * Server `https://api.infocert.digital/gosign/v5`. Its only paths are:
 *   POST   /dossiers                                  createDossier
 *   GET    /dossiers/{dossierExternalId}              getDossierUsingGET
 *   DELETE /dossiers/{dossierExternalId}              deleteDossier
 *   GET    /dossiers/{dossierExternalId}/status       getDossierStatusUsingGET
 *
 *   dossiers              → Envelope  (get only; no list path)
 *   Dossier.process tasks → Signer    (paged locally from the dossier)
 *   Dossier.documents     → Document  (paged locally from the dossier)
 *   audit trail           → REFUSED   (no path)
 *   templates             → REFUSED   (no path)
 *
 * GoSign4's OAuth API v2 (GoSign4OAuthAPI_V2) does document `GET /envelopes`,
 * but on per-installation hosts (its two servers, gosigncl-infocert.enel.com
 * and gosign-infocert.enel.com, are both Enel installations),
 * with required `folder` and `subfolder` query parameters and its own
 * envelope ids; it is not reachable from this connection. See README.md.
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
  credentialFields as infocertCredentialFields,
  exchangeCredentials as infocertExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { InfoCertClient } from './client'
import { verifyInfoCertWebhook, parseInfoCertWebhookEvents } from './webhook'

import { transformEnvelope, type RawGoSign5Dossier } from './transform/envelope'
import { transformSigners } from './transform/signer'
import { transformDocument } from './transform/document'

export interface InfoCertAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** The GoSign5 path list, quoted in every refusal. */
const GOSIGN5_PATHS =
  'the GoSign5 API documents only POST /dossiers, GET|DELETE /dossiers/{dossierExternalId} and GET /dossiers/{dossierExternalId}/status'

function notSupported(what: string, reason: string): Error {
  return Object.assign(new Error(`InfoCert cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class InfoCertAdapter implements DocsignAdapter {
  readonly platform = 'infocert'
  readonly version = '0.2.0'

  constructor(_config: InfoCertAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('infocert uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return infocertCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return infocertExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyInfoCertWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseInfoCertWebhookEvents(payload)
  }

  private client(credentials: Credentials): InfoCertClient {
    return new InfoCertClient(credentials)
  }

  /** GoSign5 `GET /dossiers/{dossierExternalId}` — "Get dossier content, except document content". */
  private getDossier(credentials: Credentials, id: string): Promise<RawGoSign5Dossier> {
    return this.client(credentials).get<RawGoSign5Dossier>(`/dossiers/${encodeURIComponent(id)}`)
  }

  // ── Envelopes (dossiers) ───────────────────────────────────────────────────

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported(
      'list dossiers',
      `${GOSIGN5_PATHS}; /dossiers is POST only ("Creates a new dossier")`,
    )
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.getDossier(credentials, id))
  }

  /**
   * Write method, out of scope for the read rebuild. `POST /dossiers/{id}/cancel`
   * is not a GoSign5 path (the spec has DELETE /dossiers/{dossierExternalId}
   * "Delete dossier"); rebuild backlog.
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/dossiers/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (task actors of the dossier) ───────────────────────────────────
  //
  // GoSign5 has no signer path; the dossier's `process.tasks[].actors[]` is the
  // whole list, returned by one unpaged GET, so it is paged locally.

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const dossier = await this.getDossier(credentials, envelopeId)
    return pageLocally(transformSigners(dossier, envelopeId), params)
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported(
      'read a signer by id',
      `${GOSIGN5_PATHS}; task actors are read from their dossier via listSigners`,
    )
  }

  // ── Documents (Dossier.documents; metadata only) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const dossier = await this.getDossier(credentials, envelopeId)
    const docs = (dossier.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i))
    return pageLocally(docs, params)
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported(
      'read a document by id',
      `${GOSIGN5_PATHS}; documents are read from their dossier via listDocuments`,
    )
  }

  // ── Audit trail ────────────────────────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list audit-trail entries', `${GOSIGN5_PATHS}; there is no audit path`)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('read an audit-trail entry', `${GOSIGN5_PATHS}; there is no audit path`)
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported('list templates', `${GOSIGN5_PATHS}; there is no templates path`)
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported('read a template', `${GOSIGN5_PATHS}; there is no templates path`)
  }
}
