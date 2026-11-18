/**
 * Namirial adapter (eSignAnyWhere REST API v6).
 *
 * Italian eIDAS-qualified trust service provider (QTSP). Every read is a
 * route in https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json:
 *
 *   envelopes      POST /v6/envelope/find, then GET /v6/envelope/{id}
 *                  + GET /v6/envelope/{id}/files for each row served
 *   signers        Activities of GET /v6/envelope/{id}
 *   documents      Documents of GET /v6/envelope/{id}/files
 *   audit trail    Events of GET /v6/envelope/{id}/history
 *   templates      POST /v6/template/find, then GET /v6/template/{id}
 *                  + GET /v6/template/{id}/files for each row served
 *
 * None of these takes a paging parameter (the find requests carry filters
 * only), so each list is fetched whole and cut to the caller's page with
 * `pageLocally`. Signers, documents and audit entries are only readable
 * through their envelope, so their ids are `<envelopeId>:<childId>`.
 *
 * Auth: API token sent as `Authorization: Bearer <token>` to the
 * connection's own eSignAnyWhere host. No interactive OAuth flow, so
 * `getAuthUrl()` throws.
 */
import { pageLocally, type Credentials, type CredentialField, type QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  NAMIRIAL_CREDENTIAL_FIELDS,
  exchangeNamirialCredentials,
  refreshNamirialCredentials,
} from './auth'
import { NamirialClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import { verifyNamirialWebhook, parseNamirialWebhookEvents } from './webhook'
import type {
  RawNamirialEnvelope,
  RawNamirialEnvelopeFiles,
  RawNamirialEnvelopeFindResponse,
  RawNamirialEnvelopeHistory,
  RawNamirialTemplate,
  RawNamirialTemplateFiles,
  RawNamirialTemplateFindResponse,
} from './types'

import { transformEnvelope } from './transform/envelope'
import { recipientActivities, transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry } from './transform/audit-trail-entry'
import { transformTemplate } from './transform/template'

/** Detail reads run for the rows of one page at a time; bound the fan-out. */
const DETAIL_CONCURRENCY = 4

async function mapBounded<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, items.length) }, worker))
  return out
}

/** Split `<envelopeId>:<childId>` at the first colon; both halves required. */
function splitChildId(id: string, what: string): [string, string] {
  const i = id.indexOf(':')
  const envelopeId = i > 0 ? id.slice(0, i) : ''
  const childId = i > 0 ? id.slice(i + 1) : ''
  if (!envelopeId || !childId) {
    throw Object.assign(
      new Error(`Namirial ${what} id must have the shape "<envelopeId>:<id>" (got "${id}")`),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return [envelopeId, childId]
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

function seg(id: string): string {
  return encodeURIComponent(id)
}

export interface NamirialAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class NamirialAdapter implements DocsignAdapter {
  readonly platform = 'namirial'
  readonly version = '0.1.0'

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: NamirialAdapterConfig) {
    this._clientId = config.clientId
    this._clientSecret = config.clientSecret
    this._redirectUri = config.redirectUri
    this._scopes = config.scopes ?? DEFAULT_SCOPES
    void this._clientId
    void this._clientSecret
    void this._redirectUri
    void this._scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'namirial uses static API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'namirial uses static API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshNamirialCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return NAMIRIAL_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeNamirialCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNamirialWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNamirialWebhookEvents(payload)
  }

  private client(credentials: Credentials): NamirialClient {
    return new NamirialClient(credentials)
  }

  private async readEnvelope(client: NamirialClient, id: string): Promise<Envelope> {
    const [raw, files] = await Promise.all([
      client.get<RawNamirialEnvelope>(`/v6/envelope/${seg(id)}`),
      client.get<RawNamirialEnvelopeFiles>(`/v6/envelope/${seg(id)}/files`),
    ])
    return transformEnvelope(raw, files)
  }

  private async readTemplate(client: NamirialClient, id: string): Promise<Template> {
    const [raw, files] = await Promise.all([
      client.get<RawNamirialTemplate>(`/v6/template/${seg(id)}`),
      client.get<RawNamirialTemplateFiles>(`/v6/template/${seg(id)}/files`),
    ])
    return transformTemplate(raw, files)
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /**
   * `POST /v6/envelope/find` with no filter set: every `EnvelopeFindRequest`
   * field is an optional filter ("If set, …") and none is a page or size, and
   * the response is the whole `Envelopes` array. The find row carries only
   * Id, Name, Status and MetaData, so each row on the caller's page is read in
   * full, exactly as `getEnvelope` reads it.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const res = await client.post<RawNamirialEnvelopeFindResponse>('/v6/envelope/find', {})
    // An absent or null `Envelopes` is no envelopes.
    const ids = (res?.Envelopes ?? []).map((row) => {
      if (!row.Id) throw new Error('Namirial POST /v6/envelope/find returned an envelope without an Id')
      return row.Id
    })
    return mapBounded(pageLocally(ids, params), (id) => this.readEnvelope(client, id))
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return this.readEnvelope(this.client(credentials), id)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/envelopes/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (activities) ──────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const env = await this.client(credentials).get<RawNamirialEnvelope>(
      `/v6/envelope/${seg(envelopeId)}`,
    )
    const signers = recipientActivities(env?.Activities).map((a) => transformSigner(a, envelopeId))
    return pageLocally(signers, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId] = splitChildId(id, 'signer')
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.id === id)
    if (!found) throw notFound(`Namirial signer ${id} not found`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const files = await this.client(credentials).get<RawNamirialEnvelopeFiles>(
      `/v6/envelope/${seg(envelopeId)}/files`,
    )
    const docs = (files?.Documents ?? []).map((d) => transformDocument(d, envelopeId))
    return pageLocally(docs, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId] = splitChildId(id, 'document')
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.id === id)
    if (!found) throw notFound(`Namirial document ${id} not found`)
    return found
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  /**
   * `GET /v6/envelope/{envelopeId}/history` returns "List of events that have
   * or will occur". Only events with `Completed: true` have happened, so only
   * those are audit-trail entries; each keeps its index in `Events` as its id.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const history = await this.client(credentials).get<RawNamirialEnvelopeHistory>(
      `/v6/envelope/${seg(envelopeId)}/history`,
    )
    // An absent or null `Events` is no events (the swagger: "Events will be
    // empty for deleted envelopes").
    const entries = (history?.Events ?? []).flatMap((event, index) =>
      event.Completed === true ? [transformAuditTrailEntry(event, envelopeId, index)] : [],
    )
    return pageLocally(entries, params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId] = splitChildId(id, 'audit-trail entry')
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all.find((e) => e.id === id)
    if (!found) throw notFound(`Namirial audit-trail entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  /**
   * `POST /v6/template/find` with no filter set (`TemplateFindRequest` has only
   * SearchText and RecipientEmail); the response is the whole `Templates`
   * array of Id, Name and MetaData, so each row on the caller's page is read
   * in full, exactly as `getTemplate` reads it.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const client = this.client(credentials)
    const res = await client.post<RawNamirialTemplateFindResponse>('/v6/template/find', {})
    // An absent or null `Templates` is no templates.
    const ids = (res?.Templates ?? []).map((row) => {
      if (!row.Id) throw new Error('Namirial POST /v6/template/find returned a template without an Id')
      return row.Id
    })
    return mapBounded(pageLocally(ids, params), (id) => this.readTemplate(client, id))
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    return this.readTemplate(this.client(credentials), id)
  }
}
