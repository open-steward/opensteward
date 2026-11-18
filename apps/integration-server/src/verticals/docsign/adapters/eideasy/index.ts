/**
 * EidEasy adapter (Italian eIDAS QTSP). Static API key auth.
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
  credentialFields as eideasyCredentialFields,
  exchangeCredentials as eideasyExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { EidEasyClient } from './client'
import { verifyEidEasyWebhook, parseEidEasyWebhookEvents } from './webhook'

export interface EidEasyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/*
 * eID Easy's API reference is the Postman collection
 * https://documenter.getpostman.com/view/3869493/Szf6WoG1 (32 requests), linked
 * from https://docs.eideasy.com. It has no list call of any kind, and none of
 * `/api/transactions`, `/api/transactions/{id}`, `/api/transactions/{id}/audit`
 * or `/api/templates`, which this adapter used to call.
 */
const NO_TRANSACTION_READ =
  'the API reference has no call that lists transactions, and no call readable with this connection returns enough to build an envelope (POST /api/signatures/signing-session/status returns only a session status for one doc_id, with no subject, signers or documents); a signing queue is read one id at a time with GET /api/signatures/signing-queues/{id}, where "authorization is performed via Authorization: Bearer {signing_queue_secret}" (https://docs.eideasy.com/multisigning/), a per-queue secret this connection does not hold'

const QUEUE_SECRET_ONLY =
  'signers and pending files are returned only by GET /api/signatures/signing-queues/{id}, where "authorization is performed via Authorization: Bearer {signing_queue_secret}" (https://docs.eideasy.com/multisigning/), a per-queue secret this connection does not hold'

const AUDIT_TRAIL_IS_A_FILE =
  'the only audit call is POST /api/signatures/download-audit-trail ("Download audit trail (only non-qualified)"), which returns one PDF as "audit_trail_file", not a list of entries'

const NO_TEMPLATES = 'the API reference has no template resource or call'

function notSupported(what: 'list' | 'get', resource: string, reason: string): Error {
  return Object.assign(new Error(`eID Easy cannot ${what} ${resource}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class EidEasyAdapter implements DocsignAdapter {
  readonly platform = 'eideasy'
  readonly version = '0.1.0'

  constructor(_config: EidEasyAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('eideasy uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return eideasyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return eideasyExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyEidEasyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEidEasyWebhookEvents(payload)
  }

  private client(credentials: Credentials): EidEasyClient {
    return new EidEasyClient(credentials)
  }

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported('list', 'envelopes', NO_TRANSACTION_READ)
  }

  async getEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw notSupported('get', 'envelopes', NO_TRANSACTION_READ)
  }

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

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list', 'signers', QUEUE_SECRET_ONLY)
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get', 'signers', QUEUE_SECRET_ONLY)
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list', 'documents', QUEUE_SECRET_ONLY)
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get', 'documents', QUEUE_SECRET_ONLY)
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list', 'audit trail entries', AUDIT_TRAIL_IS_A_FILE)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get', 'audit trail entries', AUDIT_TRAIL_IS_A_FILE)
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported('list', 'templates', NO_TEMPLATES)
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported('get', 'templates', NO_TEMPLATES)
  }
}
