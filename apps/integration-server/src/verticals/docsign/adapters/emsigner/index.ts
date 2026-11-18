/**
 * emSigner (eMudhra, India) adapter.
 *
 * Every path, parameter and reply shape here is from the vendor's Swagger
 * document for the production API, https://api.emsigner.com/swagger/docs/v1,
 * and its Postman collection,
 * https://documenter.getpostman.com/view/40123569/2sAYBbe8yV. Auth is in
 * auth.ts and client.ts.
 *
 * An envelope is an emSigner workflow. Refused: document content, Aadhaar
 * XML responses, eSign certificate payloads.
 */
import {
  DEFAULT_PAGE_LIMIT,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as emsignerCredentialFields,
  exchangeCredentials as emsignerExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { EmSignerClient } from './client'
import { verifyEmSignerWebhook, parseEmSignerWebhookEvents } from './webhook'
import type {
  RawEmSignerDocumentLogView,
  RawEmSignerFilesView,
  RawEmSignerWorkflowInfo,
} from './types'

import { transformEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry } from './transform/audit-trail-entry'

export interface EmSignerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Upper bound on GetAllDocuments pages getEnvelope walks looking for one workflow. */
const LOOKUP_MAX_PAGES = 50
/** Rows per page of that lookup walk; the docs state no maximum. */
const LOOKUP_PAGE_SIZE = 100

function notFound(what: string): Error {
  return Object.assign(new Error(`emsigner ${what} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * A workflow id as the API takes it: every documented WorkflowId / workflowId
 * parameter is `"format": "int32", "type": "integer"`. Anything else cannot
 * name a workflow, so it is not found, and nothing is sent.
 */
function workflowIdOf(id: string): number {
  if (!/^\d{1,10}$/.test(id)) throw notFound(`workflow ${JSON.stringify(id)}`)
  const n = Number(id)
  if (n > 2_147_483_647) throw notFound(`workflow ${JSON.stringify(id)}`)
  return n
}

function limitOf(params: QueryParams): number {
  const l = params.limit
  return typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : DEFAULT_PAGE_LIMIT
}

export class EmSignerAdapter implements DocsignAdapter {
  readonly platform = 'emsigner'
  readonly version = '0.2.0'

  constructor(_config: EmSignerAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('emsigner uses AppName + SecretKey auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return emsignerCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return emsignerExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyEmSignerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEmSignerWebhookEvents(payload)
  }

  private client(credentials: Credentials): EmSignerClient {
    return new EmSignerClient(credentials)
  }

  /**
   * POST /api/GetWorkflowInfo with body `WorkflowInfoInput` { WorkflowId,
   * ReferenceNo, ParentDocumentId }; reply `ReturnObject[WorkflowInfo]`.
   * Postman: "Get all Signatories, documents and signed dates results of a
   * workflow."
   */
  private async workflowInfo(
    client: EmSignerClient,
    workflowId: number,
  ): Promise<RawEmSignerWorkflowInfo> {
    const info = await client.post<RawEmSignerWorkflowInfo>('/api/GetWorkflowInfo', {
      WorkflowId: workflowId,
    })
    if (!info || typeof info !== 'object') throw notFound(`workflow ${workflowId}`)
    return info
  }

  /**
   * POST /api/GetAllDocuments with body `WorkflowSearchViewModel`; reply
   * `ReturnObject[List[FilesView]]`. Postman: `pagenumber` "Used for
   * pagination", `PageSize` "Number of items per page for pagination".
   * Page numbers are 1-based: the sibling GetDocumentsByStatus documents its
   * `PageNumber` as "PageSize=1 returns 1-10 records in document store
   * PageSize=2 returns 11-20 records".
   */
  private async documentsPage(
    client: EmSignerClient,
    body: { pagenumber: number; PageSize: number; Referenceno?: string },
  ): Promise<RawEmSignerFilesView[]> {
    const rows = await client.post<RawEmSignerFilesView[]>('/api/GetAllDocuments', body)
    return Array.isArray(rows) ? rows : []
  }

  /**
   * One GetAllDocuments page per caller page, at the caller's page number and
   * size. The docs give no total and no next-page marker, so a short page
   * ends the collection; `pageByRows` looks one page ahead after a full page
   * so `hasMore` is exact. Each row is then completed from GetWorkflowInfo.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const size = limitOf(params)
    const key = cursorPagerKey(client.scope, 'envelopes', { PageSize: size })
    const { items } = await pageByRows<RawEmSignerFilesView, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const rows = await this.documentsPage(client, { pagenumber: page, PageSize: size })
        return { items: rows, next: rows.length < size ? null : page + 1 }
      },
      { defaultLimit: DEFAULT_PAGE_LIMIT },
    )
    const out: Envelope[] = []
    for (const row of items) {
      if (typeof row.WorkFlowId !== 'number') {
        throw new Error('emsigner GetAllDocuments returned a row with no WorkFlowId')
      }
      out.push(transformEnvelope(row, await this.workflowInfo(client, row.WorkFlowId)))
    }
    return out
  }

  /**
   * GetWorkflowInfo gives everything but the workflow's name, status and
   * originator, which only its GetAllDocuments row carries. That row is
   * found by the workflow's ReferenceNo (GetAllDocuments' documented
   * `Referenceno` filter; GetWorkflowInfo: "Unique reference number for
   * tracking the workflow") and matched on WorkFlowId.
   */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const workflowId = workflowIdOf(id)
    const client = this.client(credentials)
    const info = await this.workflowInfo(client, workflowId)
    const ref =
      typeof info.ReferenceNo === 'string' && info.ReferenceNo !== '' ? info.ReferenceNo : undefined
    for (let page = 1; page <= LOOKUP_MAX_PAGES; page++) {
      const rows = await this.documentsPage(client, {
        pagenumber: page,
        PageSize: LOOKUP_PAGE_SIZE,
        ...(ref ? { Referenceno: ref } : {}),
      })
      const row = rows.find((r) => r.WorkFlowId === workflowId)
      if (row) return transformEnvelope(row, info)
      if (rows.length < LOOKUP_PAGE_SIZE) break
    }
    throw notFound(`workflow ${workflowId}`)
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

  /** WorkflowInfo.Signatories, whole; the endpoint takes no paging parameters. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const workflowId = workflowIdOf(envelopeId)
    const info = await this.workflowInfo(this.client(credentials), workflowId)
    const id = String(workflowId)
    const all = (info.Signatories ?? []).map((s, i) => transformSigner(s, id, i))
    return pageLocally(all, params)
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `emsigner does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  /** WorkflowInfo.DocumentInfo, whole; the endpoint takes no paging parameters. */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const workflowId = workflowIdOf(envelopeId)
    const info = await this.workflowInfo(this.client(credentials), workflowId)
    const id = String(workflowId)
    const all = (info.DocumentInfo ?? []).map((d, i) => transformDocument(d, id, i))
    return pageLocally(all, params)
  }

  async getDocument(_credentials: Credentials, id: string): Promise<Document> {
    throw new Error(
      `emsigner documents are envelope-scoped; call listDocuments(envelopeId). id=${id}`,
    )
  }

  /**
   * GET /api/GetDocumentLog?workflowId=… — Postman: "Pass workflowId(fetched
   * using GetAllDocuments api)"; reply `ReturnObject[List[DocumentLogView]]`.
   * The endpoint takes no paging parameters, so the log is read whole.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const workflowId = workflowIdOf(envelopeId)
    const views = await this.client(credentials).get<RawEmSignerDocumentLogView[]>(
      '/api/GetDocumentLog',
      { workflowId },
    )
    const id = String(workflowId)
    const all: AuditTrailEntry[] = []
    for (const view of Array.isArray(views) ? views : []) {
      for (const log of view.DocumentLogs ?? []) {
        all.push(transformAuditTrailEntry(log, view.DocumentName, id, all.length))
      }
    }
    return pageLocally(all, params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('emsigner audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw notFound(`audit entry ${id}`)
    return found
  }

  /**
   * Refused before any request. GET /api/ListTemplates is real, but its reply
   * (`ReturnObject[List[GetWorkflow]]`) holds only TemplateId, TemplateName,
   * ParentId, TemplateType and SubscriberId, and no emSigner endpoint reads a
   * template's documents, so the canonical Template's required documentCount
   * has no documented source.
   */
  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported(
      'emSigner cannot list templates: its ListTemplates reply ("GetWorkflow": TemplateId, TemplateName, ParentId, TemplateType, SubscriberId) documents no document count, which a Template requires',
    )
  }

  /** Refused before any request: emSigner documents no template-by-id endpoint. */
  async getTemplate(_credentials: Credentials, id: string): Promise<Template> {
    throw notSupported(
      `emSigner cannot read a template by id: its API (https://api.emsigner.com/swagger/docs/v1) has no template-by-id endpoint. id=${id}`,
    )
  }
}
