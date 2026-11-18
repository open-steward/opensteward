/**
 * Conga Sign adapter (eSignature, powered by OneSpan).
 *
 * Wires Conga Sign's OAuth2 client-credentials grant, the regional
 * signconnector REST API, and Conga Sign callback notifications to the
 * canonical docsign schema.
 *
 * The public signconnector surface is transaction-scoped: a single package is
 * fetched by id via `GET /api/signconnector/v1/transaction/{packageId}`, and
 * signers, documents, and the synthesised audit trail are all derived from that
 * package. There is no public list-transactions endpoint and no templates
 * resource, so `listEnvelopes` / `voidEnvelope` / templates are intentionally
 * not implemented (the router returns 501 for them).
 *
 * Refused: document content, signature images, KBA/ID-verification payloads —
 * the canonical schema has no field for them.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: template — The public signconnector API has no templates endpoint;
//              templates are only a creation-time parameter on /transaction, not
//              a queryable resource.

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { WebhookEvent } from '../../schema/webhook'

import {
  clientCredentialsGrant,
  normaliseCongaSignRegion,
  refreshCredentials as congaSignRefresh,
} from './auth'
import { CongaSignClient } from './client'
import { DEFAULT_REGION, DEFAULT_SCOPES } from './constants'
import { verifyCongaSignWebhook, parseCongaSignWebhookEvents } from './webhook'

import { transformEnvelope, packageRecipients, type RawCongaSignPackage } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { buildAuditEntries, transformAuditTrailEntry } from './transform/audit-trail-entry'

const CREDENTIALS_REQUIRED = 'Conga Sign client ID and client secret are required.'

const REGION_OPTIONS = [
  { value: 'prod-us', label: 'Production — United States' },
  { value: 'prod-eu', label: 'Production — Europe' },
  { value: 'prod-au', label: 'Production — Australia' },
  { value: 'preview-us', label: 'Preview — United States' },
  { value: 'preview-eu', label: 'Preview — Europe' },
  { value: 'preview-au', label: 'Preview — Australia' },
] as const

export interface CongaSignAdapterConfig {
  /**
   * Deployment-wide client credentials. Optional: the client belongs to the
   * customer's Conga tenant, so each connection normally supplies its own on
   * the Connect page (`credentialFields`) and they are kept on
   * `credentials.extra`.
   */
  clientId?: string
  clientSecret?: string
  /** Deployment-wide region fallback (selects the RLS + login hosts). Normally collected per connection. */
  region?: string
  scopes?: string[]
}

export class CongaSignAdapter implements DocsignAdapter {
  readonly platform = 'conga-sign'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private region: string
  private scopes: string[]

  constructor(config: CongaSignAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.region = config.region ?? DEFAULT_REGION
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth (OAuth2 client-credentials — machine-to-machine, no redirect) ─────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'Conga Sign uses the OAuth2 client-credentials grant; there is no authorization-code redirect. Connect with a client ID, client secret and region instead.',
    )
  }

  /**
   * The client credentials and the region are the customer's: the region
   * picks the login host the secret is POSTed to and the API host every call
   * goes to.
   */
  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'The client ID of the application registered for Conga Sign in your Conga Platform admin.',
      },
      { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
      {
        name: 'region',
        label: 'Conga region',
        type: 'select',
        required: true,
        options: REGION_OPTIONS,
        helpText: 'The Conga environment your tenant is hosted in.',
      },
    ]
  }

  /** Mint a token on the customer's region and keep what the refresh grant needs. */
  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields?.['clientId'] ?? '').trim()
    const clientSecret = (fields?.['clientSecret'] ?? '').trim()
    if (!clientId || !clientSecret) throw new Error(CREDENTIALS_REQUIRED)
    const region = normaliseCongaSignRegion(fields?.['region'])
    const creds = await clientCredentialsGrant(clientId, clientSecret, this.scopes, region)
    return { ...creds, extra: { region, clientId, clientSecret } }
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) throw new Error(CREDENTIALS_REQUIRED)
    return clientCredentialsGrant(
      this.clientId,
      this.clientSecret,
      this.scopes,
      normaliseCongaSignRegion(this.region),
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return congaSignRefresh(credentials, this.clientId, this.clientSecret, this.scopes, this.region)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCongaSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCongaSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): CongaSignClient {
    return new CongaSignClient(credentials)
  }

  private async fetchPackage(
    credentials: Credentials,
    packageId: string,
  ): Promise<RawCongaSignPackage> {
    return this.client(credentials).get<RawCongaSignPackage>(`/transaction/${packageId}`)
  }

  // ── Envelopes (transaction-scoped — fetch by id) ───────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchPackage(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers ────────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.fetchPackage(credentials, envelopeId)
    return packageRecipients(raw).map((r) => transformSigner(r, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<packageId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on package ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.fetchPackage(credentials, envelopeId)
    return (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<packageId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on package ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (synthesised from package lifecycle + recipients) ──

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.fetchPackage(credentials, envelopeId)
    return buildAuditEntries(raw).map((e, i) => transformAuditTrailEntry(e, envelopeId, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<packageId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
