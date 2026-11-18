/**
 * Sphereon eIDAS Signature adapter (VDX eIDAS Signature REST API v1).
 *
 * Sphereon's eIDAS Advanced Electronic Signature service is a cryptographic
 * signing-primitive API, not an envelope/recipient signing workflow. The
 * only listable/gettable REST resources are signature *configurations*
 * (`GET /configs`, `GET /configs/{configId}`) — reusable definitions of a
 * signature level + digest algorithm + form parameters. Those map onto the
 * canonical docsign `Template` (a reusable signing setup).
 *
 * Sphereon has no envelope, recipient/signer, document-metadata, or
 * audit-trail surface, so those canonical resource methods are intentionally
 * left unimplemented — the router returns 501 Not Implemented for them. The
 * API has no webhook/callback support, so no webhook methods are wired.
 *
 * Auth: bearer API token sent as `Authorization: Bearer <token>`. No
 * interactive OAuth redirect flow, so `getAuthUrl()` throws.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Available:   template       — GET /configs, GET /configs/{id}
 * Unavailable: envelope       — no envelope/signing-workflow endpoint exists
 * Unavailable: signer         — no signer/recipient management endpoint exists
 * Unavailable: document       — no document-metadata endpoint; docs passed inline
 * Unavailable: audit-trail-entry — no audit-trail or event-log endpoint exists
 * ────────────────────────────────────────────────────────────────────────────
 */
import { pageLocally } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Template } from '../../schema/template'

import { SPHEREON_CREDENTIAL_FORM, refreshSphereonCredentials } from './auth'
import { SphereonClient } from './client'
import { DEFAULT_SCOPES } from './constants'

import { transformTemplate, type RawSphereonSignatureConfig } from './transform/template'

export interface BlueinkBypassAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class BlueinkBypassAdapter implements DocsignAdapter {
  readonly platform = 'blueink-bypass'
  readonly version = '0.1.0'

  private _scopes: string[]

  constructor(config: BlueinkBypassAdapterConfig) {
    this._scopes = config.scopes ?? DEFAULT_SCOPES
    void this._scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'Sphereon eIDAS Signature uses bearer API-token auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Sphereon eIDAS Signature uses bearer API-token auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshSphereonCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return SPHEREON_CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return SPHEREON_CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  private client(credentials: Credentials): SphereonClient {
    return new SphereonClient(credentials)
  }

  // ── Templates (Sphereon signature configurations) ──────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    // GET /configs documents no query parameters and returns every
    // configuration as one bare array, so the caller's page is cut here.
    const res = await this.client(credentials).get<RawSphereonSignatureConfig[]>('/configs')
    return pageLocally((Array.isArray(res) ? res : []).map(transformTemplate), params)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSphereonSignatureConfig>(
      `/configs/${encodeURIComponent(id)}`,
    )
    return transformTemplate(raw)
  }
}
