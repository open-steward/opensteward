/**
 * OneSpan Sign adapter.
 *
 * Maps OneSpan `packages` → canonical `Envelope`, role+signer combos →
 * `Signer`, the package's `documents[]` → `Document` (metadata only),
 * `/packages/{id}/audit` → `AuditTrailEntry`, and
 * `/packages?type=TEMPLATE` → `Template`.
 *
 * OneSpan uses a static API key (Connect Link), not OAuth.
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as onespanCredentialFields,
  exchangeCredentials as onespanExchangeCredentials,
} from './auth'
import { OneSpanSignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyOneSpanSignWebhook,
  parseOneSpanSignWebhookEvents,
} from './webhook'

import {
  transformEnvelope,
  type RawOneSpanPackage,
  type RawOneSpanRole,
  type RawOneSpanSigner,
} from './transform/envelope'
import {
  transformSigner,
  type RawOneSpanSignerFlat,
} from './transform/signer'
import {
  transformDocument,
  type RawOneSpanDocument,
} from './transform/document'
import {
  transformAuditTrailEntry,
  type RawOneSpanAuditEvent,
} from './transform/audit-trail-entry'
import {
  transformTemplate,
  type RawOneSpanTemplate,
} from './transform/template'

export interface OneSpanSignAdapterConfig {
  clientId: string
  /** Treated as the API key when no OAuth flow exists. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface PackagesListResponse {
  results?: RawOneSpanPackage[]
  count?: number
}

/** `GET /api/packages/{packageId}/audit` (https://docs.onespan.com/docs/retrieving-an-audit-trail). */
interface AuditResponse {
  'package-id'?: string
  'audit-events'?: RawOneSpanAuditEvent[]
}

/**
 * The documented audit `date-time` ("2016-04-20 14:14:51") carries no zone,
 * and OneSpan does not say which one it is in. The connection names it as an
 * IANA zone in `credentials.extra.timeZone`; without one the adapter refuses
 * rather than guess.
 */
function auditTimeZone(credentials: Credentials): string {
  const tz = credentials.extra?.['timeZone']
  if (typeof tz !== 'string' || tz === '') {
    throw Object.assign(
      new Error(
        'OneSpan Sign cannot list audit-trail entries without a time zone: the documented ' +
          'audit "date-time" (e.g. "2016-04-20 14:14:51") carries none. Set ' +
          'credentials.extra.timeZone to the IANA zone of the account (e.g. "America/Toronto").',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw Object.assign(
      new Error(`OneSpan Sign credentials.extra.timeZone "${tz}" is not an IANA time zone`),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return tz
}

function flattenRoleSigners(
  roles: RawOneSpanRole[] | undefined,
): RawOneSpanSignerFlat[] {
  const out: RawOneSpanSignerFlat[] = []
  for (const role of roles ?? []) {
    for (const signer of role.signers ?? []) {
      out.push({
        ...(signer as Record<string, unknown>),
        roleId: role.id,
        roleName: role.name,
        roleType: role.type,
        roleIndex: role.index,
      } as RawOneSpanSignerFlat)
    }
  }
  return out
  void ([] as RawOneSpanSigner[]) // type retention
}

export class OneSpanSignAdapter implements DocsignAdapter {
  readonly platform = 'onespan-sign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: OneSpanSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('onespan-sign uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('onespan-sign uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys are static — refresh is a no-op.
    return credentials
  }

  credentialFields(): CredentialField[] {
    return onespanCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    // If an admin has pre-baked the API key into config.clientSecret, allow
    // a no-form path; otherwise read from the submitted form.
    if (!fields.apiKey && this.clientSecret) {
      return { accessToken: this.clientSecret }
    }
    return onespanExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOneSpanSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOneSpanSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): OneSpanSignClient {
    return new OneSpanSignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      from: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
      to: (params.page ?? 1) * (params.limit ?? DEFAULT_PAGE_SIZE) - 1,
    }
  }

  // ── Envelopes (packages) ──────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<PackagesListResponse>(
      '/packages',
      this.listParams(params),
    )
    return (res.results ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawOneSpanPackage>(`/packages/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/packages/${id}`, { status: 'INACTIVE' })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (roles[].signers[]) ───────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /packages/{packageId} takes no paging parameter and returns every
    // role and signer, so page the whole collection here.
    const raw = await this.client(credentials).get<RawOneSpanPackage>(
      `/packages/${envelopeId}`,
    )
    return pageLocally(
      flattenRoleSigners(raw.roles).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('OneSpan getSigner expects id of shape "<packageId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`OneSpan signer ${signerId} not found on package ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // Same package JSON as listSigners: every document, no paging parameter.
    const raw = await this.client(credentials).get<RawOneSpanPackage>(
      `/packages/${envelopeId}`,
    )
    return pageLocally(
      (raw.documents ?? []).map((d: RawOneSpanDocument, i: number) =>
        transformDocument(d, envelopeId, i),
      ),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('OneSpan getDocument expects id of shape "<packageId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`OneSpan document ${documentId} not found on package ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const timeZone = auditTimeZone(credentials)
    // GET /api/packages/{packageId}/audit documents no paging parameter and
    // returns the whole trail, so page it here.
    const res = await this.client(credentials).get<AuditResponse>(
      `/packages/${envelopeId}/audit`,
    )
    const events = res['audit-events']
    if (!Array.isArray(events)) {
      throw new Error(`OneSpan audit response for package ${envelopeId} has no audit-events array`)
    }
    return pageLocally(
      events.map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i, timeZone)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('OneSpan audit-trail id expects shape "<packageId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`OneSpan audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<PackagesListResponse>(
      '/packages',
      { ...this.listParams(params), type: 'TEMPLATE' },
    )
    return (res.results ?? []).map((raw) => transformTemplate(raw as RawOneSpanTemplate))
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawOneSpanTemplate>(
      `/packages/${id}`,
    )
    return transformTemplate(raw)
  }
}
