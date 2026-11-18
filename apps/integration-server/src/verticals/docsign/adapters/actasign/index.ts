/**
 * actaSIGN adapter.
 *
 * Maps the actaSIGN REST API to the canonical docsign schema:
 *   signing processes → Envelope   (path not in the actaSIGN OpenAPI; rebuild backlog)
 *   request tasks     → Signer     (GET /v2/requests/{requestUid}[/tasks/{taskUid}])
 *   portfolio assets  → Document   (GET /v2/portfolios/{portfolioUid}; metadata only)
 *   audit trail       → REFUSED    (the API only serves a protocol PDF)
 *   templates         → Template   (path not in the actaSIGN OpenAPI; rebuild backlog)
 *
 * The documented API is the OpenAPI 3.0.3 document served at
 * https://my.actasign.ch/api-docs/, production server https://web.actasign.ch/api.
 *
 * Auth here is still a legacy Authorization-Code flow against auth.actasign.swiss,
 * which the spec does not document: it says to "Request a Bearer token via
 * actaPASS" with a client-credential flow (no token URL given). Webhooks are
 * HMAC-SHA256; webhook.ts reads a header name that differs from the spec's
 * `X-actaSIGN-Webhook-Signature-hmac-sha256`. Both are rebuild backlog.
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
  exchangeCode as actasignExchange,
  refreshCredentials as actasignRefresh,
} from './auth'
import { ActasignClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  DOCUMENTED_API_BASE_URL,
  TASK_READ_CONCURRENCY,
} from './constants'
import { verifyActasignWebhook, parseActasignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawActasignSigningProcess,
} from './transform/envelope'
import { transformSigner, type RawActasignTask } from './transform/signer'
import { transformDocument, type RawActasignAsset } from './transform/document'
import { transformTemplate, type RawActasignTemplate } from './transform/template'

export interface ActasignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `RemoteCompactRequest` fields read here (actaSIGN OpenAPI, GET /v2/requests/{requestUid}). */
interface RawActasignCompactRequest {
  requestUid?: string
  portfolioUid?: string
  status?: string
  steps?: Array<{ stepUid?: string; displayName?: string; tasks?: Array<{ taskUid?: string }> }>
}

/**
 * List shape the legacy envelope/template methods assume. Not in the actaSIGN
 * OpenAPI (which has no /signing-processes or /templates path); unverified.
 */
interface ListResponse<T> {
  items?: T[]
  pagination?: { page?: number; page_size?: number; total_pages?: number; total?: number }
}

/** Map with at most `limit` calls of `fn` in flight; results keep input order. */
async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export class ActasignAdapter implements DocsignAdapter {
  readonly platform = 'actasign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ActasignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return actasignExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return actasignRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyActasignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseActasignWebhookEvents(payload)
  }

  private client(credentials: Credentials): ActasignClient {
    return new ActasignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    if (params['updated_after']) out.updated_after = String(params['updated_after'])
    else if (params.updatedAfter instanceof Date) out.updated_after = params.updatedAfter.toISOString()
    return out
  }

  // ── Envelopes (signing processes) ──────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<ListResponse<RawActasignSigningProcess>>(
      '/signing-processes',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawActasignSigningProcess>(
      `/signing-processes/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/signing-processes/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled via API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (tasks) ────────────────────────────────────────────────────────
  //
  // actaSIGN OpenAPI (https://my.actasign.ch/api-docs/): GET
  // /v2/requests/{requestUid} "Retrieve any request in the tenant" returns
  // `RemoteCompactRequest` with `steps[].tasks[]`; GET
  // /v2/requests/{requestUid}/tasks/{taskUid} "Retrieve any task in the tenant"
  // returns `RemoteTaskResponse` with the recipients and lifecycle dates.
  // Neither documents a paging parameter, so the request's whole task list is
  // paged locally and only the served page's tasks are read in detail.

  private documented(credentials: Credentials): ActasignClient {
    return new ActasignClient(credentials, DOCUMENTED_API_BASE_URL)
  }

  private async getRequest(
    credentials: Credentials,
    requestUid: string,
  ): Promise<RawActasignCompactRequest> {
    return this.documented(credentials).get<RawActasignCompactRequest>(
      `/v2/requests/${encodeURIComponent(requestUid)}`,
    )
  }

  private async getTask(
    credentials: Credentials,
    requestUid: string,
    taskUid: string,
  ): Promise<RawActasignTask> {
    return this.documented(credentials).get<RawActasignTask>(
      `/v2/requests/${encodeURIComponent(requestUid)}/tasks/${encodeURIComponent(taskUid)}`,
    )
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const request = await this.getRequest(credentials, envelopeId)
    const taskUids: string[] = []
    for (const step of request.steps ?? []) {
      for (const task of step.tasks ?? []) {
        if (!task.taskUid) throw new Error(`actaSIGN request ${envelopeId} lists a task without taskUid`)
        taskUids.push(task.taskUid)
      }
    }
    const page = pageLocally(taskUids, params)
    const tasks = await mapBounded(page, TASK_READ_CONCURRENCY, (uid) =>
      this.getTask(credentials, envelopeId, uid),
    )
    return tasks.map(transformSigner)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [requestUid, taskUid, extra] = id.split(':')
    if (!requestUid || !taskUid || extra !== undefined) {
      throw new Error('getSigner expects an id of shape "<requestUid>:<taskUid>"')
    }
    return transformSigner(await this.getTask(credentials, requestUid, taskUid))
  }

  // ── Documents (portfolio assets; metadata only — content REFUSED) ──────────
  //
  // GET /v2/portfolios/{portfolioUid} "Retrieve a portfolio with its assets" is
  // documented as "the way to reach the documents of a portfolio that holds
  // more than one"; the request's `portfolioUid` names it. No paging
  // parameter is documented, so the asset array is paged locally.

  private async requestAssets(
    credentials: Credentials,
    requestUid: string,
  ): Promise<{ portfolioUid: string; assets: RawActasignAsset[] }> {
    const request = await this.getRequest(credentials, requestUid)
    if (!request.portfolioUid) {
      throw new Error(`actaSIGN request ${requestUid} has no portfolioUid`)
    }
    const portfolio = await this.documented(credentials).get<{ assets?: RawActasignAsset[] }>(
      `/v2/portfolios/${encodeURIComponent(request.portfolioUid)}`,
    )
    return { portfolioUid: request.portfolioUid, assets: portfolio.assets ?? [] }
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const { portfolioUid, assets } = await this.requestAssets(credentials, envelopeId)
    return pageLocally(
      assets.map((raw, i) => transformDocument(raw, envelopeId, portfolioUid, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [requestUid, assetUid, extra] = id.split(':')
    if (!requestUid || !assetUid || extra !== undefined) {
      throw new Error('getDocument expects an id of shape "<requestUid>:<assetUid>"')
    }
    const { portfolioUid, assets } = await this.requestAssets(credentials, requestUid)
    const i = assets.findIndex((a) => a.assetUid === assetUid)
    if (i < 0) throw new Error(`actaSIGN asset ${assetUid} not found in request ${requestUid}`)
    return transformDocument(assets[i]!, requestUid, portfolioUid, i)
  }

  // ── Audit-trail entries (REFUSED) ──────────────────────────────────────────
  //
  // The only audit surface in the actaSIGN OpenAPI is GET
  // /requests/{request_uid}/protocol, "Download request audit protocol PDF",
  // whose 200 response is `application/pdf`. No endpoint returns audit events
  // as data, so both methods refuse before sending anything.

  private auditRefusal(): Error {
    return Object.assign(
      new Error(
        'actaSIGN cannot list audit trail entries: its API only offers ' +
          'GET /requests/{request_uid}/protocol, "Download request audit protocol PDF" ' +
          '(application/pdf), not audit events as data',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw this.auditRefusal()
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw this.auditRefusal()
  }

  // ── Templates ────────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<ListResponse<RawActasignTemplate>>(
      '/templates',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawActasignTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
