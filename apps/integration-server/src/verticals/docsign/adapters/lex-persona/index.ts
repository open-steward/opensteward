/**
 * Lex Persona adapter: Goodflag Signature Workflow Manager API.
 *
 * Lex Persona is Goodflag: www.lex-persona.com redirects to goodflag.com, whose
 * Organization record names `"alternateName": "Lex Persona"`. The API is the
 * Workflow Manager (https://docs.goodflag.com/wm/api-reference/introduction.md),
 * served from the customer's own tenant host under `/api`, with a Bearer API
 * token (see ./auth.ts).
 *
 * Mapping: parapheur (`/api/workflows`) → Envelope, step recipients → Signer,
 * `/api/documents` → Document, modèle de parapheur (`/api/templates`) →
 * Template. Every `Search *` endpoint pages with `itemsPerPage` ("maximum
 * 50") and a 0-based `pageIndex`, and answers `{ pageIndex, itemsPerPage,
 * totalItems, items }` (https://docs.goodflag.com/wm/api-reference/structure.md).
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CredentialField, Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as lexPersonaCredentialFields,
  exchangeCredentials as lexPersonaExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { LexPersonaClient, tenantBaseUrl } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyLexPersonaWebhook, parseLexPersonaWebhookEvents } from './webhook'

import { transformEnvelope, type RawGoodflagWorkflow } from './transform/envelope'
import { signersOf } from './transform/signer'
import { transformDocument, type RawGoodflagDocument } from './transform/document'
import { transformTemplate, type RawGoodflagTemplate } from './transform/template'

export interface LexPersonaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** The documented response of every `Search *` endpoint. */
export interface GoodflagSearchPage<T> {
  pageIndex?: number
  itemsPerPage?: number
  totalItems?: number
  items?: T[]
}

/** Thrown before any request by a method the platform has no way to serve. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Why no audit trail is served. The API's per-workflow proof material is a
 * PDF and a ZIP: the evidence certificate "est un fichier au format PDF
 * récapitulatif du parapheur" (`GET
 * /api/workflows/{workflowId}/downloadEvidenceCertificate`) and the evidence
 * folder "est une archive ZIP" (`…/downloadEvidences`)
 * (https://docs.goodflag.com/wm/guides/integration/recuperer-des-documents-signes-et-des-preuves.md).
 *
 * `GET /api/logs` does take an `items.entityId` filter ("La ou les valeurs de
 * filtre du champ entityId"), so a per-workflow operation list exists — but
 * only for a token with the `tenantManager` role
 * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/logs/search-logs.md),
 * and those `log_` entries are the "Journal d'exécution (débogage)" that the
 * vendor says "n'est pas destiné à être analysé de façon programmatique"
 * (https://docs.goodflag.com/wm/api-reference/structure.md). Serving it as an
 * audit trail would build on a format the vendor disclaims, so this is a
 * deliberate refusal, not an absent endpoint.
 */
const AUDIT_UNSUPPORTED =
  'Lex Persona (Goodflag) serves no audit trail: its evidence is a PDF certificate and a ZIP of evidence files, and its only per-workflow operation list (GET /api/logs?items.entityId=…, tenantManager tokens only) is an execution journal the vendor says is "pas destiné à être analysé de façon programmatique"'

/** Template document counts in flight at once (one request per template). */
const TEMPLATE_COUNT_CONCURRENCY = 4

/** `Promise.all(items.map(fn))` with at most `limit` calls running, in order. */
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
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export class LexPersonaAdapter implements DocsignAdapter {
  readonly platform = 'lex-persona'
  readonly version = '0.2.0'
  /** "`itemsPerPage` (maximum 50)" on every Search endpoint (structure.md). */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: LexPersonaAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('lex-persona uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return lexPersonaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return lexPersonaExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLexPersonaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLexPersonaWebhookEvents(payload)
  }

  private client(credentials: Credentials): LexPersonaClient {
    return new LexPersonaClient(credentials)
  }

  /**
   * One caller page of a `Search *` endpoint.
   *
   * A caller limit of 1..50 is one upstream page: `itemsPerPage` is the limit
   * and `pageIndex` the 0-based caller page, and `totalItems` ("Le nombre
   * total d'éléments, toutes pages comprises") decides `hasMore`. A larger
   * limit cannot be sent, so `pageByRows` fills it from 50-row upstream pages.
   * `map` gets each row's 0-based position in the whole result.
   */
  private async search<Raw, R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    filters: Record<string, string>,
    map: (raw: Raw, position: number) => R,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const fetchPage = async (pageIndex: number, size: number) => {
      const res = await client.get<GoodflagSearchPage<Raw>>(path, {
        ...filters,
        itemsPerPage: size,
        pageIndex,
      })
      const raws = res.items ?? []
      const total = typeof res.totalItems === 'number' ? res.totalItems : undefined
      // Without totalItems, only a short page says the result has ended.
      const more = total !== undefined ? (pageIndex + 1) * size < total : raws.length >= size
      return { rows: raws.map((raw, i) => map(raw, pageIndex * size + i)), more, total }
    }
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    if (Number.isInteger(limit) && limit >= 1 && limit <= MAX_PAGE_SIZE) {
      const pageIndex = pageOffset(params, limit) / limit
      const { rows, more, total } = await fetchPage(pageIndex, limit)
      reportUpstreamPage(params, {
        hasMore: more,
        ...(total !== undefined ? { totalCount: total } : {}),
      })
      return rows
    }
    const key = cursorPagerKey(
      connectionScope(`lex-persona:${tenantBaseUrl(credentials) ?? ''}`, credentials),
      path,
      { ...filters, itemsPerPage: MAX_PAGE_SIZE },
    )
    const result = await pageByRows<R, number>(
      key,
      params,
      async (cursor): Promise<CursorPage<R, number>> => {
        const pageIndex = cursor ?? 0
        const { rows, more } = await fetchPage(pageIndex, MAX_PAGE_SIZE)
        return { items: rows, next: more && rows.length > 0 ? pageIndex + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  // ── Envelopes (parapheurs) ─────────────────────────────────────────────────

  /** `GET /api/workflows` "Recherche dans tous les parapheurs." */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    return this.search<RawGoodflagWorkflow, Envelope>(
      credentials,
      params,
      '/api/workflows',
      {},
      (raw) => transformEnvelope(raw),
    )
  }

  /** `GET /api/workflows/{workflowId}` "Renvoie un parapheur existant." */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.getWorkflow(credentials, id))
  }

  private async getWorkflow(credentials: Credentials, id: string): Promise<RawGoodflagWorkflow> {
    return this.client(credentials).get<RawGoodflagWorkflow>(
      `/api/workflows/${encodeURIComponent(id)}`,
    )
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

  // ── Signers (step recipients) ──────────────────────────────────────────────

  /** Every recipient of every step of one `GET /api/workflows/{id}`, paged locally. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(signersOf(await this.getWorkflow(credentials, envelopeId)), params)
  }

  /**
   * A recipient has no id of its own and the API has no recipient lookup: a
   * recipient is only reachable through `GET /api/workflows/{workflowId}`,
   * which this signer id (`<stepId>:<email>`) does not carry.
   */
  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw notSupported(
      `Lex Persona (Goodflag) cannot look up a signer by id: recipients exist only within a workflow's steps, so read them with listSigners(envelopeId). id=${id}`,
    )
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  /** `GET /api/documents?items.workflowId=…` "Recherche dans tous les documents de parapheur." */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return this.search<RawGoodflagDocument, Document>(
      credentials,
      params,
      '/api/documents',
      { 'items.workflowId': envelopeId },
      transformDocument,
    )
  }

  /** `GET /api/documents/{documentId}` "Renvoie un document de parapheur existant." */
  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawGoodflagDocument>(
      `/api/documents/${encodeURIComponent(id)}`,
    )
    return transformDocument(raw, 0)
  }

  // ── Audit trail ────────────────────────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(AUDIT_UNSUPPORTED)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(AUDIT_UNSUPPORTED)
  }

  // ── Templates (modèles de parapheur) ───────────────────────────────────────

  /**
   * A template's document count: `GET /api/templateDocuments` filtered by
   * `items.templateId`, read from `totalItems`
   * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/workflow-template-documents/search-template-documents.md).
   */
  private async templateDocumentCount(
    client: LexPersonaClient,
    templateId: string,
  ): Promise<number> {
    const res = await client.get<GoodflagSearchPage<unknown>>('/api/templateDocuments', {
      'items.templateId': templateId,
      itemsPerPage: 1,
      pageIndex: 0,
    })
    if (typeof res.totalItems !== 'number') {
      throw new Error(`lex-persona templateDocuments for ${templateId} returned no totalItems`)
    }
    return res.totalItems
  }

  /** `GET /api/templates` "Recherche dans tous les modèles de parapheur." */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const client = this.client(credentials)
    let raws: RawGoodflagTemplate[]
    try {
      raws = await this.search<RawGoodflagTemplate, RawGoodflagTemplate>(
        credentials,
        params,
        '/api/templates',
        {},
        (raw) => raw,
      )
    } catch (err) {
      // Kept from the previous adapter, which the cross-adapter
      // list-templates-error-propagation test pins: a 404 reads as "no
      // templates". Anything else (auth rejected, upstream 5xx) propagates.
      if ((err as { response?: { status?: number } }).response?.status === 404) return []
      throw err
    }
    return mapBounded(raws, TEMPLATE_COUNT_CONCURRENCY, async (raw) =>
      transformTemplate(raw, await this.templateDocumentCount(client, raw.id)),
    )
  }

  /** `GET /api/templates/{templateId}` "Renvoie un modèle de parapheur existant." */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const client = this.client(credentials)
    const raw = await client.get<RawGoodflagTemplate>(`/api/templates/${encodeURIComponent(id)}`)
    return transformTemplate(raw, await this.templateDocumentCount(client, raw.id))
  }
}
