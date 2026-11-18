/**
 * LuxTrust adapter (Luxembourg eIDAS QTSP). Static API key auth.
 *
 * LuxTrust publishes no API reference for its e-signature platform. The
 * product page
 * https://www.luxtrust.com/en/professionals/our-digital-solutions/sign-electronically
 * says only "Its services and modules are fully accessible via a set of APIs
 * or through a provided user interface" and closes with a contact form. The
 * repository at https://www.luxtrust.com/en/repository holds certificate and
 * signature policies, not an API. The host this adapter used,
 * api.luxtrust.com, has no DNS A record, and developer.luxtrust.com and
 * docs.luxtrust.com do not resolve.
 *
 * Every read therefore refuses with 501 NOT_SUPPORTED before any request is
 * built. voidEnvelope (a write) is unchanged and still targets the
 * unverified api.luxtrust.com host.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as luxtrustCredentialFields,
  exchangeCredentials as luxtrustExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { LuxTrustClient } from './client'
import { verifyLuxTrustWebhook, parseLuxTrustWebhookEvents } from './webhook'

export interface LuxTrustAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

const UNDOCUMENTED_REASON =
  'LuxTrust publishes no API reference; its e-signature page says only "Its services and ' +
  'modules are fully accessible via a set of APIs or through a provided user interface" ' +
  '(https://www.luxtrust.com/en/professionals/our-digital-solutions/sign-electronically)'

function notSupported(what: 'list' | 'get', resource: string): Error {
  return Object.assign(new Error(`LuxTrust cannot ${what} ${resource}: ${UNDOCUMENTED_REASON}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class LuxTrustAdapter implements DocsignAdapter {
  readonly platform = 'luxtrust'
  readonly version = '0.1.0'

  constructor(_config: LuxTrustAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('luxtrust uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return luxtrustCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return luxtrustExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLuxTrustWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLuxTrustWebhookEvents(payload)
  }

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported('list', 'envelopes')
  }

  async getEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw notSupported('get', 'envelopes')
  }

  /** Write method, out of scope for the read rebuild and left as it was:
   *  POST /documents/{id}/cancel on api.luxtrust.com is undocumented. Its
   *  read-back goes through getEnvelope, which now refuses. */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await new LuxTrustClient(credentials).post(`/documents/${id}/cancel`, {
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
