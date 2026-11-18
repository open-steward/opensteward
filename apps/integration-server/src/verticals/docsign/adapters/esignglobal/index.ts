/**
 * eSignGlobal (eSign.AI) adapter.
 *
 * Maps the eSignGlobal envelope onto the canonical docsign schema:
 *   envelope detail        → Envelope   (GET /envelope/envelopeDetail, POST /envelope/cancel)
 *   envelope `signerInfos` → Signer     (derived from the envelope detail; CC recipients too)
 *   envelope `signFiles`   → Document   (metadata only — bytes are REFUSED)
 *   template list / detail → Template   (GET /templates/templateList, /templates/templateDetail)
 *
 * Authentication: an App ID + Secret Key (Settings > Integration > Apps) are
 * exchanged for a 24h Bearer access token via the client_credentials grant.
 * There is no interactive OAuth redirect — credentials are collected through
 * the Connect Link flow (`credentialFields()` + `exchangeCredentials()`).
 *
 * Resources eSignGlobal does NOT expose are deliberately left unimplemented
 * and auto-resolve to 501 Not Implemented at the router:
 *   - listEnvelopes:  there is no envelope list/search endpoint — envelopes
 *                     are addressed by id (`envelopeId`).
 *   - audit-trail:    eSignGlobal has no queryable audit-events endpoint.
 *   - webhooks:       Callback Events carry no signature/HMAC, so there is
 *                     nothing to verify and no handler is wired here.
 *
 * Refused fields:
 *   - Signed-document content / base64 PDF / download bytes (Download File
 *     endpoint is never called)
 *   - Signature images and digital-certificate bundles
 *   - Identity-verification (eKYC / OTP / ID-number) payloads
 *
 * Docs: https://www.esign.ai/en-US/developer-center/api
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: audit-trail-entry — eSignGlobal exposes no queryable audit-events endpoint; Callback Events are push-only webhooks with no history read surface.

import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as esignglobalExchange,
  refreshCredentials as esignglobalRefresh,
  esignglobalCredentialFields,
  exchangeCredentials as esignglobalExchangeCredentials,
} from './auth'
import { EsignglobalClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawEsignglobalEnvelope } from './transform/envelope'
import { transformSigner, transformCcSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawEsignglobalTemplate } from './transform/template'

export interface EsignglobalAdapterConfig {
  redirectUri?: string
}

/** GET /templates/templateList → `data`. */
interface TemplateListResponse {
  total?: number
  templateList?: RawEsignglobalTemplate[]
}

export class EsignglobalAdapter implements DocsignAdapter {
  readonly platform = 'esignglobal'
  readonly version = '0.1.0'

  constructor(_config: EsignglobalAdapterConfig = {}) {
    // eSignGlobal uses static App ID + Secret Key credentials; no OAuth client config.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return esignglobalExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return esignglobalRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return esignglobalCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return esignglobalExchangeCredentials(fields)
  }

  private client(credentials: Credentials): EsignglobalClient {
    return new EsignglobalClient(credentials)
  }

  private async fetchEnvelope(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<RawEsignglobalEnvelope> {
    return this.client(credentials).get<RawEsignglobalEnvelope>('/envelope/envelopeDetail', {
      envelopeId,
    })
  }

  // ── Envelopes ──────────────────────────────────────────────────────────────
  // No list endpoint — listEnvelopes is intentionally not implemented (501).

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchEnvelope(credentials, id)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post('/envelope/cancel', {
      envelopeId: id,
      reason: data?.reason ?? 'Voided via API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (envelope `signerInfos` + `CCInfos`) ─────────────────────────────

  // GET /envelope/envelopeDetail takes only `envelopeId` and returns the whole
  // envelope, so the child lists are paged locally over every row.
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.allSigners(credentials, envelopeId), params)
  }

  private async allSigners(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const raw = await this.fetchEnvelope(credentials, envelopeId)
    const signers = (raw.signerInfos ?? []).map((s) => transformSigner(s, raw))
    const ccs = (raw.CCInfos ?? []).map((cc, i) => transformCcSigner(cc, raw, i))
    return [...signers, ...ccs]
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const sep = id.indexOf(':')
    if (sep <= 0) {
      throw new Error('eSignGlobal getSigner expects an id of shape "<envelopeId>:<order>:<who>"')
    }
    const envelopeId = id.slice(0, sep)
    const all = await this.allSigners(credentials, envelopeId)
    const found = all.find((s) => s.externalId === id)
    if (!found) throw new Error(`Signer ${id} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (envelope `signFiles` / `attachments` — content REFUSED) ───────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return pageLocally(await this.allDocuments(credentials, envelopeId), params)
  }

  private async allDocuments(credentials: Credentials, envelopeId: string): Promise<Document[]> {
    const raw = await this.fetchEnvelope(credentials, envelopeId)
    const docs: Document[] = []
    let order = 0
    for (const f of raw.signFiles ?? []) {
      if (f.fileKey) docs.push(transformDocument(f, envelopeId, order++, 'signFile'))
    }
    for (const f of raw.attachments ?? []) {
      if (f.fileKey) docs.push(transformDocument(f, envelopeId, order++, 'attachment'))
    }
    return docs
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.indexOf(':')
    if (sep <= 0) {
      throw new Error('eSignGlobal getDocument expects an id of shape "<envelopeId>:<fileKey>"')
    }
    const envelopeId = id.slice(0, sep)
    const all = await this.allDocuments(credentials, envelopeId)
    const found = all.find((d) => d.externalId === id)
    if (!found) throw new Error(`Document ${id} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const pageSize = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    // eSignGlobal serves at most 20 templates a page. Reported so the router
    // judges a full page of 20 against 20, not against the caller's 100 —
    // which read it as the last page. The signer and document lists are whole
    // fetches per envelope, so this is not an adapter-wide maxPageSize.
    reportUpstreamPage(params, { pageSize })
    const res = await this.client(credentials).get<TemplateListResponse>('/templates/templateList', {
      pageNum: params.page ?? 1,
      pageSize,
    })
    return (res.templateList ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawEsignglobalTemplate>(
      '/templates/templateDetail',
      { templateId: id },
    )
    return transformTemplate(raw)
  }
}
