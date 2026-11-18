/**
 * Icertis Contract Intelligence (ICI) adapter.
 *
 * ICI is a Contract Lifecycle Management platform; its e-signature surface
 * lives on the Agreement entity. We map agreements → envelopes, signatories
 * → signers, associated documents/versions → documents (metadata only), and
 * ICI templates → templates.
 *
 * Auth is Microsoft Entra ID (Azure AD) authorization-code OAuth2 with the
 * per-tenant ICI gateway host + `ici-product-key` carried on the token.
 *
 * Not implemented (the router returns 501): audit-trail entries — ICI has no
 * public signing-audit event API — and webhooks — ICI's outbound integration
 * carries no publicly documented signed-payload contract.
 *
 * Refused at the schema level: document content, signature images, executed
 * contract bodies. The canonical Document carries filename + size only.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: audit-trail-entry — ICI has no public REST endpoint for signing-audit events; the platform exposes no audit-trail or event-history API surface in its documented API catalog.

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as icertisExchange,
  refreshCredentials as icertisRefresh,
} from './auth'
import { IcertisClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import {
  transformEnvelope,
  type RawIcertisAgreement,
  type RawIcertisSignatory,
  type RawIcertisAssociatedDocument,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawIcertisTemplate } from './transform/template'

/**
 * Deployment-wide fallbacks. All three are normally the customer's, collected
 * at connect time (`oauthFields`) and read back from `credentials.extra`.
 */
export interface IcertisAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Microsoft Entra ID Directory (tenant) ID. Defaults to the multi-tenant `common` endpoint. */
  tenantId?: string
  /** ICI API gateway, e.g. https://api-in1.icertis.com */
  instanceUrl?: string
  /** ICI subscription / product key sent in the ici-product-key header. */
  productKey?: string
  scopes?: string[]
}

/** ICI list envelope: rows under a typed collection key plus paging metadata. */
interface AgreementListResponse {
  Agreements?: RawIcertisAgreement[]
  Data?: RawIcertisAgreement[]
  TotalRowCount?: number
  TotalNumberOfPages?: number
  hasMoreData?: boolean
}

interface TemplateListResponse {
  Templates?: RawIcertisTemplate[]
  Data?: RawIcertisTemplate[]
  TotalRowCount?: number
  TotalNumberOfPages?: number
  hasMoreData?: boolean
}

const AGREEMENT_EXPAND = 'signatories,externalsignatory,associateddocuments'

export class IcertisAdapter implements DocsignAdapter {
  readonly platform = 'icertis'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private tenantId: string | undefined
  private instanceUrl: string | undefined
  private productKey: string | undefined
  private scopes: string[]

  constructor(config: IcertisAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.tenantId = config.tenantId
    this.instanceUrl = config.instanceUrl
    this.productKey = config.productKey
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /**
   * Every ICI call goes to the customer's regional API gateway with the
   * customer's product key, and the Entra app usually lives in the customer's
   * directory — none of which deployment config can know. Asked for before
   * the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'ICI API gateway URL',
        type: 'url',
        required: true,
        placeholder: 'https://api-us1.icertis.com',
        helpText:
          'The ICI Developer Experience gateway for your instance: https://api-<region><number>.icertis.com (with -nonprod for non-production).',
      },
      {
        name: 'tenantId',
        label: 'Microsoft Entra tenant ID',
        type: 'text',
        required: false,
        placeholder: '00000000-0000-0000-0000-000000000000',
        helpText:
          'The Directory (tenant) ID of the Entra app registration used for ICI. Leave blank only if that app is multi-tenant.',
      },
      {
        name: 'productKey',
        label: 'ICI product key',
        type: 'password',
        required: false,
        helpText: 'The ici-product-key subscription key for your gateway, if your instance requires one.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['tenantId'] ?? this.tenantId,
      inputs?.['instanceUrl'] ?? this.instanceUrl,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return icertisExchange(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      this.tenantId,
      this.instanceUrl,
      this.productKey,
    )
  }

  /** Exchange on the customer's directory and remember gateway, tenant and key with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return icertisExchange(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['tenantId'] ?? this.tenantId,
      inputs['instanceUrl'] ?? this.instanceUrl,
      inputs['productKey'] ?? this.productKey,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return icertisRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): IcertisClient {
    return new IcertisClient(credentials, this.instanceUrl, this.productKey)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const pageSize = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const out: Record<string, unknown> = { pageSize }
    out.page = params.page ?? 1
    if (params['select']) out.select = String(params['select'])
    if (params['filter']) out.filter = String(params['filter'])
    return out
  }

  // ── Envelopes (Agreements) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<AgreementListResponse>('/agreements', {
      ...this.listParams(params),
      expand: AGREEMENT_EXPAND,
    })
    const rows = res.Agreements ?? res.Data ?? []
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawIcertisAgreement>(`/agreement/${id}`, {
      expand: AGREEMENT_EXPAND,
    })
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/agreement/${id}/cancel`, {
      Reason: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (Signatories) ─────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawIcertisAgreement>(`/agreement/${envelopeId}`, {
      expand: 'signatories,externalsignatory',
    })
    const parties: RawIcertisSignatory[] = [
      ...(raw.Signatories ?? []),
      ...(raw.ExternalSignatory ?? []),
    ]
    return parties.map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signatoryId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signatoryId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<signatoryId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signatoryId)
    if (!found) throw new Error(`Signatory ${signatoryId} not found on agreement ${envelopeId}`)
    return found
  }

  // ── Documents (associated documents — metadata only) ──────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<RawIcertisAgreement>(`/agreement/${envelopeId}`, {
      expand: 'associateddocuments,versions',
    })
    const docs: RawIcertisAssociatedDocument[] = [
      ...(raw.AssociatedDocuments ?? []),
      ...(raw.Versions ?? []),
    ]
    return docs.map((d, i) => transformDocument(d, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on agreement ${envelopeId}`)
    return found
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/templates',
      this.listParams(params),
    )
    const rows = res.Templates ?? res.Data ?? []
    return rows.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawIcertisTemplate>(`/template/${id}`)
    return transformTemplate(raw)
  }
}
