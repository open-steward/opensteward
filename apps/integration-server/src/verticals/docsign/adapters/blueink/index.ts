/**
 * Blueink adapter.
 *
 * Maps Blueink Bundles → canonical `Envelope` (a Bundle groups documents,
 * signer "packets", and the event log), bundle `packets` → `Signer`, the
 * bundle `documents` manifest → `Document` (metadata only — content REFUSED),
 * the bundle event log → `AuditTrailEntry`, and Blueink templates →
 * `Template`.
 *
 * Auth is a static Private API key (`Authorization: Token <key>`) collected
 * via the Connect Link form; there is no OAuth flow, so `getAuthUrl` /
 * `exchangeCode` throw.
 *
 * Docs: https://developer.blueink.com/docs/esignature-api/
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { FORM } from './auth'
import { BlueinkClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyBlueinkWebhook, parseBlueinkWebhookEvents } from './webhook'

import { transformEnvelope, type RawBlueinkBundle } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawBlueinkEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawBlueinkTemplate } from './transform/template'

export interface BlueinkAdapterConfig {
  clientId: string
  /** Treated as the API key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class BlueinkAdapter implements DocsignAdapter {
  readonly platform = 'blueink'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BlueinkAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('blueink uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('blueink uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBlueinkWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBlueinkWebhookEvents(payload)
  }

  private client(credentials: Credentials): BlueinkClient {
    return new BlueinkClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    return out
  }

  // ── Envelopes (bundles) ───────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RawBlueinkBundle[]>(
      '/bundles/',
      this.listParams(params),
    )
    return (res ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawBlueinkBundle>(`/bundles/${id}/`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/bundles/${id}/cancel/`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (packets on a bundle) ─────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /bundles/{bundleSlug}/ takes only the slug (and `include`) and
    // returns every packet, so the caller's page is cut from the whole array.
    const raw = await this.client(credentials).get<RawBlueinkBundle>(`/bundles/${envelopeId}/`)
    return pageLocally(
      (raw.packets ?? []).map((p) => transformSigner(p, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, packetId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !packetId) {
      throw new Error('blueink getSigner expects an id of shape "<bundleId>:<packetId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === packetId)
    if (!found) throw new Error(`blueink packet ${packetId} not found on bundle ${envelopeId}`)
    return found
  }

  // ── Documents (bundle documents manifest, metadata only — content REFUSED) ─

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The whole `documents` array comes in one reply. Page after mapping so
    // the index-derived ids stay stable across pages.
    const raw = await this.client(credentials).get<RawBlueinkBundle>(`/bundles/${envelopeId}/`)
    return pageLocally(
      (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, orderStr] = id.split(':')
    if (!envelopeId || orderStr === undefined) {
      throw new Error('blueink getDocument expects an id of shape "<bundleId>:<order>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all[Number(orderStr)]
    if (!found) throw new Error(`blueink document ${id} not found`)
    return found
  }

  // ── Audit-trail entries (bundle event log) ─────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<RawBlueinkEvent[]>(
      `/bundles/${envelopeId}/events/`,
    )
    return (res ?? []).map((e, i) => transformAuditTrailEntry(e, envelopeId, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('blueink audit-trail id expects shape "<bundleId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`blueink audit entry ${id} not found`)
    return found
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<RawBlueinkTemplate[]>(
      '/templates/',
      this.listParams(params),
    )
    return (res ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawBlueinkTemplate>(`/templates/${id}/`)
    return transformTemplate(raw)
  }
}
