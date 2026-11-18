/**
 * D-Trust sign-me adapter (Bundesdruckerei, Germany).
 *
 * eIDAS QTSP. The OAuth2 + REST wiring (constants.ts) is unverified: no API
 * reference is published, and neither api.sign-me.de nor the OAuth host
 * login.sign-me.de resolves, so the connect flow (getAuthUrl, exchangeCode,
 * refreshCredentials) and DEFAULT_SCOPES are undocumented as well.
 * Every read method refuses with 501 NOT_SUPPORTED; see NOT_READABLE_REASON.
 * voidEnvelope (a write, out of scope for the read rebuild) still posts to the
 * unverified `/documents/{id}/cancel` path.
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as dtrustExchange,
  refreshCredentials as dtrustRefresh,
} from './auth'
import { DTrustSignMeClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import { verifyDTrustSignMeWebhook, parseDTrustSignMeWebhookEvents } from './webhook'

export interface DTrustSignMeAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * D-Trust sign-me is a remote signature service, not an envelope store. Its
 * API page (https://www.d-trust.net/en/solutions/sign-me-api) compares the
 * connection options and, for "API Direkt", answers "Workflows and templates"
 * with "Poss. yes (only if implemented in an integrated application or
 * specialised process)". Its product sheet
 * (https://www.d-trust.net/files/dokumente/pdf/product_sheet_sign-me.pdf, p.2)
 * is more direct: "When sign-me is connected via an API (interface), the
 * remote signature service then only receives so-called hash values, which
 * ensure uniqueness." No public API reference is published, and the
 * `https://api.sign-me.de/v1` host this adapter used to call does not resolve.
 */
const NOT_READABLE_REASON =
  'D-Trust documents workflows and templates for a direct API connection as "Poss. yes (only if ' +
  'implemented in an integrated application or specialised process)" and publishes no API ' +
  'for reading them back (https://www.d-trust.net/en/solutions/sign-me-api)'

function notSupported(what: 'list' | 'get', resource: string): Error {
  return Object.assign(
    new Error(`D-Trust sign-me cannot ${what} ${resource}: ${NOT_READABLE_REASON}`),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class DTrustSignMeAdapter implements DocsignAdapter {
  readonly platform = 'd-trust-sign-me'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DTrustSignMeAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return dtrustExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return dtrustRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDTrustSignMeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDTrustSignMeWebhookEvents(payload)
  }

  private client(credentials: Credentials): DTrustSignMeClient {
    return new DTrustSignMeClient(credentials)
  }

  // ── Envelopes, signers, documents, audit trail, templates: not readable ──

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported('list', 'envelopes')
  }

  async getEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw notSupported('get', 'envelopes')
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list', 'signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get', 'signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list', 'documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get', 'documents')
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list', 'audit trail entries')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get', 'audit trail entries')
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported('list', 'templates')
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported('get', 'templates')
  }
}
