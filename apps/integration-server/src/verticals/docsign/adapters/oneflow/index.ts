/**
 * Oneflow adapter (Swedish, contract-automation + e-signature).
 *
 * The contract is the envelope. Oneflow renders the contract body (structured
 * clauses) to PDF for signing; only metadata flows through the canonical
 * schema — no clause-tree content, no rendered PDF bytes.
 */
import { pageLocally } from '@opensteward/shared'
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
  exchangeCode as oneflowExchange,
  refreshCredentials as oneflowRefresh,
} from './auth'
import { OneflowClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyOneflowWebhook, parseOneflowWebhookEvents } from './webhook'

import { transformEnvelope, type RawOneflowContract, type RawOneflowParticipant } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawOneflowTemplate } from './transform/template'

export interface OneflowAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ContractsListResponse {
  data?: RawOneflowContract[]
}

interface TemplatesListResponse {
  data?: RawOneflowTemplate[]
}

/**
 * Oneflow's API reference (https://developer.oneflow.com/llms.txt) documents
 * contract events only by id — "Get a contract event by ID",
 * GET /contracts/{contract_id}/events/{event_id}
 * (https://developer.oneflow.com/reference/get-a-contract-event-by-id.md) —
 * and no operation that lists them. The old call, GET /contracts/{id}/audit_trail,
 * is not in the reference and the live API answers it with 404. The by-id read
 * is not wired either: its ids come only from a listing, and the reference's
 * auth is an `x-oneflow-api-token` header this adapter does not send.
 */
const AUDIT_UNSUPPORTED =
  'the API reference documents only "Get a contract event by ID" ' +
  '(GET /contracts/{contract_id}/events/{event_id}) and no operation that lists contract events'

// Oneflow does document a by-id event read, but this adapter cannot use it:
// that endpoint requires the x-oneflow-api-token header, which this adapter's
// OAuth bearer auth does not send, and the '<envelopeId>:<index>' ids this
// method used to accept came only from the undocumented list.
const AUDIT_GET_UNSUPPORTED =
  'the documented read GET /contracts/{contract_id}/events/{event_id} requires the ' +
  'x-oneflow-api-token header, which this adapter does not send, and no documented ' +
  'operation lists the event ids it would need'

function notSupported(what: string, reason: string): Error {
  return Object.assign(new Error(`Oneflow cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class OneflowAdapter implements DocsignAdapter {
  readonly platform = 'oneflow'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: OneflowAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return oneflowExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return oneflowRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOneflowWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOneflowWebhookEvents(payload)
  }

  private client(credentials: Credentials): OneflowClient {
    return new OneflowClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<ContractsListResponse>(
      '/contracts',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawOneflowContract>(`/contracts/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/contracts/${id}/terminate`)
    return this.getEnvelope(credentials, id)
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /contracts/{id} documents no paging parameters and embeds every
    // party's participants (at most 40 per contract), so the flattened list
    // is the whole collection and is paged locally.
    const raw = await this.client(credentials).get<RawOneflowContract>(`/contracts/${envelopeId}`)
    const participants: RawOneflowParticipant[] = []
    for (const party of raw.parties ?? []) {
      for (const p of party.participants ?? []) participants.push(p)
    }
    return pageLocally(
      participants.map((p) => transformSigner(p, envelopeId)),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `Oneflow participants are contract-scoped; call listSigners(envelopeId). id=${id}`,
    )
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The contract is its one document; paged locally so page 2 is empty.
    const raw = await this.client(credentials).get<RawOneflowContract>(`/contracts/${envelopeId}`)
    return pageLocally([transformDocument(raw)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawOneflowContract>(`/contracts/${id}`)
    return transformDocument(raw)
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list audit trail entries', AUDIT_UNSUPPORTED)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get audit trail entries', AUDIT_GET_UNSUPPORTED)
  }

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    try {
      const res = await this.client(credentials).get<TemplatesListResponse>(
        '/templates',
        this.listParams(params),
      )
      return (res.data ?? []).map(transformTemplate)
    } catch (err) {
      // 404 is a real answer here: several of these platforms simply do not
      // expose a template endpoint, and an empty list is the correct result.
      // Anything else (auth rejected, upstream 5xx) must propagate: listTemplates
      // is a LISTABLE_RESOURCES method, so the sync worker reads a returned array
      // as truth and would record a green "synced 0 templates" for a dead platform.
      if ((err as { response?: { status?: number } }).response?.status === 404) return []
      throw err
    }
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawOneflowTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
