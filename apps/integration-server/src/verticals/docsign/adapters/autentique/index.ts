/**
 * Autentique (Brazil) adapter.
 *
 * GraphQL-only API at `/v2/graphql`. The adapter wraps each canonical read
 * as a GraphQL query. Static API key auth — no OAuth.
 */
import { reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as autentiqueCredentialFields,
  exchangeCredentials as autentiqueExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { AutentiqueClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyAutentiqueWebhook, parseAutentiqueWebhookEvents } from './webhook'

import { transformEnvelope, type RawAutentiqueDocument } from './transform/envelope'
import { transformSigner, type RawAutentiqueSignature } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export interface AutentiqueAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentsQueryResponse {
  documents?: { total?: number; data: RawAutentiqueDocument[] }
}

interface DocumentQueryResponse {
  document?: RawAutentiqueDocument
}

/**
 * Autentique documents no query for signing templates: its documented queries
 * are `me`, `documents`/`document`, `organizations`, `folders` and
 * `emailTemplates` (https://docs.autentique.com.br/api/llms.txt), and
 * `emailTemplates` lists notification e-mail layouts, not signing templates.
 */
const TEMPLATES_UNSUPPORTED_REASON =
  '"There is no way in the API to directly use the panel templates to create documents." ' +
  '(https://docs.autentique.com.br/api/mutations/criando-um-documento)'

function templatesNotSupported(what: 'list' | 'get'): Error {
  return Object.assign(
    new Error(`Autentique cannot ${what} templates: ${TEMPLATES_UNSUPPORTED_REASON}`),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

const QUERIES = {
  // Paged by `limit` and a 1-based `page`; `total` counts every page
  // (https://docs.autentique.com.br/api/queries/resgatando-documentos).
  listDocuments: `query Documents($limit: Int!, $page: Int!) {
    documents(limit: $limit, page: $page) {
      total
      data {
        id name refusable sortable created_at updated_at expiration_at
        signatures { public_id name email created_at action { name }
          user { id name email } user_data { name email }
          signed { ip created_at } rejected { reason created_at } viewed { created_at } }
      }
    }
  }`,
  getDocument: `query Document($id: UUID!) {
    document(id: $id) {
      id name refusable sortable created_at updated_at expiration_at
      signatures { public_id name email created_at action { name }
        user { id name email } user_data { name email }
        signed { ip created_at } rejected { reason created_at } viewed { created_at } }
    }
  }`,
}

export class AutentiqueAdapter implements DocsignAdapter {
  readonly platform = 'autentique'
  readonly version = '0.1.0'

  constructor(_config: AutentiqueAdapterConfig) {
    // Config fields unused at construction (no OAuth) — kept for symmetry.
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('autentique uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return autentiqueCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return autentiqueExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAutentiqueWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAutentiqueWebhookEvents(payload)
  }

  private client(credentials: Credentials): AutentiqueClient {
    return new AutentiqueClient(credentials)
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    const res = await this.client(credentials).query<DocumentsQueryResponse>(
      QUERIES.listDocuments,
      { limit, page },
    )
    const rows = res.documents?.data ?? []
    const total = res.documents?.total
    if (typeof total === 'number') {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: (page - 1) * limit + rows.length < total,
      })
    }
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).query<DocumentQueryResponse>(QUERIES.getDocument, {
      id,
    })
    if (!res.document) throw new Error(`autentique document ${id} not found`)
    return transformEnvelope(res.document)
  }

  async voidEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw new Error(
      'autentique void/cancel via GraphQL mutation not implemented in this adapter — cancel from the dashboard.',
    )
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).query<DocumentQueryResponse>(QUERIES.getDocument, {
      id: envelopeId,
    })
    if (!res.document) throw new Error(`autentique document ${envelopeId} not found`)
    return (res.document.signatures ?? []).map((s) =>
      transformSigner(s as RawAutentiqueSignature, envelopeId),
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `autentique does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const env = await this.getEnvelope(credentials, envelopeId)
    return [transformDocument(env.raw as RawAutentiqueDocument)]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const env = await this.getEnvelope(credentials, id)
    return transformDocument(env.raw as RawAutentiqueDocument)
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).query<DocumentQueryResponse>(QUERIES.getDocument, {
      id: envelopeId,
    })
    const doc = res.document
    if (!doc) throw new Error(`autentique document ${envelopeId} not found`)
    const events: SyntheticAuditEvent[] = []
    if (doc.created_at) {
      events.push({
        envelopeId,
        occurredAt: doc.created_at,
        type: 'created',
        description: 'Document created',
      })
    }
    for (const sig of doc.signatures ?? []) {
      const email = sig.user?.email ?? sig.user_data?.email ?? sig.email
      const name = sig.user?.name ?? sig.user_data?.name ?? sig.name
      if (sig.viewed?.created_at) {
        events.push({
          envelopeId,
          occurredAt: sig.viewed.created_at,
          type: 'viewed',
          signerEmail: email,
          signerName: name,
          signerId: sig.public_id,
          description: 'Signer viewed document',
        })
      }
      if (sig.signed?.created_at) {
        events.push({
          envelopeId,
          occurredAt: sig.signed.created_at,
          type: 'signed',
          signerEmail: email,
          signerName: name,
          signerId: sig.public_id,
          ip: sig.signed.ip,
          description: 'Signer signed',
        })
      }
      if (sig.rejected?.created_at) {
        events.push({
          envelopeId,
          occurredAt: sig.rejected.created_at,
          type: 'declined',
          signerEmail: email,
          signerName: name,
          signerId: sig.public_id,
          description: sig.rejected.reason ?? 'Signer rejected',
        })
      }
    }
    events.sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''))
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('autentique audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`audit entry ${id} not found`)
    return found
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw templatesNotSupported('list')
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw templatesNotSupported('get')
  }
}
