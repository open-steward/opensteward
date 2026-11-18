/**
 * ZorroSign adapter — blockchain-based digital-transaction-management.
 *
 * Maps ZorroSign document packages (Z-Sign signing requests) → canonical
 * `Envelope` and Z-Fill templates → `Template`. Signers and documents
 * refuse with 501 NOT_SUPPORTED: the vendor's API page documents no
 * recipients or documents resource (see `notSupported` below).
 *
 * Auth is a static account API key (`X-API-KEY`) collected via the Connect
 * Link form; there is no OAuth handshake. Audit-trail entries and webhooks
 * are not exposed by ZorroSign's public Open API, so those resource methods
 * are intentionally absent and the router returns 501 for them.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: audit-trail-entry — ZorroSign API docs inaccessible (ECONNREFUSED
//   for api.zorrosign.com and www.zorrosign.com); the original adapter comment
//   states "not exposed by ZorroSign's public Open API" but this could not be
//   independently confirmed from authoritative docs.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'

import { ZORROSIGN_CREDENTIAL_FORM } from './auth'
import { ZorrosignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawZorrosignPackage } from './transform/envelope'
import { transformTemplate, type RawZorrosignTemplate } from './transform/template'

export interface ZorrosignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface PackageListResponse {
  packages?: RawZorrosignPackage[]
  data?: RawZorrosignPackage[]
}

interface PackageResponse {
  package?: RawZorrosignPackage
  data?: RawZorrosignPackage
}

interface TemplateListResponse {
  templates?: RawZorrosignTemplate[]
  data?: RawZorrosignTemplate[]
}

interface TemplateResponse {
  template?: RawZorrosignTemplate
  data?: RawZorrosignTemplate
}

/**
 * The documented read surface, quoted verbatim from
 * https://www.zafersign.com/developers/api/ ("Integration capabilities").
 */
export const ZAFERSIGN_DOCUMENTED_READS =
  'Get Process Status, Details, Full Details, and All Processes'

function notSupported(what: string): Error {
  return Object.assign(
    new Error(
      `ZorroSign (now ZaferSign) cannot ${what}: its API documents no recipients or documents resource, only "${ZAFERSIGN_DOCUMENTED_READS}"`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class ZorrosignAdapter implements DocsignAdapter {
  readonly platform = 'zorrosign'
  readonly version = '0.1.0'

  // Connect Link support — API key + environment form (no OAuth).
  credentialFields = ZORROSIGN_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = ZORROSIGN_CREDENTIAL_FORM.exchangeCredentials

  constructor(_config?: ZorrosignAdapterConfig) {
    // ZorroSign authenticates with a static API key; no OAuth client config
    // is needed. The config is accepted for factory uniformity only.
  }

  // ── Auth (API-key model — OAuth is not supported) ──────────────────────────

  getAuthUrl(): string {
    throw new Error('ZorroSign uses API-key auth; there is no OAuth authorize URL.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('ZorroSign uses API-key auth; use the Connect Link credential form.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys are static — nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): ZorrosignClient {
    return new ZorrosignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    if (params.updatedAfter instanceof Date) out.updated_after = params.updatedAfter.toISOString()
    else if (params['updated_after']) out.updated_after = String(params['updated_after'])
    return out
  }

  // ── Envelopes (document packages) ──────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<PackageListResponse>(
      '/packages',
      this.listParams(params),
    )
    return (res.packages ?? res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<PackageResponse | RawZorrosignPackage>(
      `/packages/${id}`,
    )
    const pkg =
      (res as PackageResponse).package ??
      (res as PackageResponse).data ??
      (res as RawZorrosignPackage)
    if (!pkg.package_id) throw new Error(`ZorroSign package ${id} not found`)
    return transformEnvelope(pkg)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/packages/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers and documents: refused ──────────────────────────────────────
  // The first-party API page (https://www.zafersign.com/developers/api/,
  // ZaferSign is "Formerly ZorroSign") lists the whole read surface as "Get
  // Process Status, Details, Full Details, and All Processes". It names no
  // recipients or documents resource, and the previous paths
  // (/packages/{id}/recipients, /packages/{id}/documents on api.zorrosign.com)
  // appear in no ZorroSign or ZaferSign doc; that host does not resolve.
  // So both resources refuse before any request is sent.

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('read signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('read documents')
  }

  // ── Templates (Z-Fill forms) ───────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.templates ?? res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<TemplateResponse | RawZorrosignTemplate>(
      `/templates/${id}`,
    )
    const tmpl =
      (res as TemplateResponse).template ??
      (res as TemplateResponse).data ??
      (res as RawZorrosignTemplate)
    if (!tmpl.template_id) throw new Error(`ZorroSign template ${id} not found`)
    return transformTemplate(tmpl)
  }
}
