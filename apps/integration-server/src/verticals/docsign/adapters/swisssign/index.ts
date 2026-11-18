/**
 * SwissSign adapter (Swiss ZertES/eIDAS trust service provider). Static API key auth.
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
  credentialFields as swisssignCredentialFields,
  exchangeCredentials as swisssignExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SwissSignClient } from './client'
import { verifySwissSignWebhook, parseSwissSignWebhookEvents } from './webhook'

export interface SwissSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * Every read refuses before sending. The paths this adapter used
 * (`/v1/documents`, `/v1/documents/{id}`, `/v1/documents/{id}/audit`,
 * `/v1/templates`) live on https://api.swisssign.com, a host that does not
 * exist (NXDOMAIN), and SwissSign publishes no API reference to rebuild them
 * from: https://www.swisssign.com/en/digital-signatures/rest-api.html routes
 * integrators to a contact form instead. The `api/organizations/…/rooms`
 * routes in the sign.swisssign.com console bundle are that web app's private
 * backend (HTTP Basic realm, no API-key scheme, no documented response shape),
 * not an integrator API.
 */
const NO_PUBLIC_API =
  'SwissSign publishes no API reference; its REST-API page asks integrators to "Tell us about your functional and technical use case – from KYC to employment contracts and API specifications, authentication flows and system architecture." (https://www.swisssign.com/en/digital-signatures/rest-api.html), and api.swisssign.com does not resolve'

function refuse(what: string): Error {
  return Object.assign(new Error(`SwissSign cannot ${what}: ${NO_PUBLIC_API}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class SwissSignAdapter implements DocsignAdapter {
  readonly platform = 'swisssign'
  readonly version = '0.1.0'

  constructor(_config: SwissSignAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('swisssign uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return swisssignCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return swisssignExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySwissSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSwissSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): SwissSignClient {
    return new SwissSignClient(credentials)
  }

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw refuse('list envelopes')
  }

  async getEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw refuse('get envelopes')
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    // Write path, out of this rebuild's scope: POST /documents/{id}/cancel on
    // api.swisssign.com is not a documented SwissSign path and the host does
    // not resolve. It then reads back through getEnvelope, which refuses.
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
    throw refuse('list signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw refuse('get signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw refuse('list documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw refuse('get documents')
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw refuse('list audit trail entries')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw refuse('get audit trail entries')
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw refuse('list templates')
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw refuse('get templates')
  }
}
