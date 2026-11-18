/**
 * Webdox CLM adapter.
 *
 * Maps Webdox CLM "decision workflows" → canonical Envelope, the signers on a
 * workflow's signature steps → Signer, the workflow's documents → Document
 * (metadata only), workflow templates → Template, and the global activity log
 * (GET /api/v2/audit) → AuditTrailEntry.
 *
 * Webdox authenticates with an OAuth2 password-credentials grant rather than a
 * browser redirect, so the adapter opts into the Connect Link credential form
 * (email + password + customer environment) — auth_type=api_key. The required
 * BaseAdapter OAuth-redirect methods are unsupported and throw.
 *
 * Webdox CLM v2 does not expose a webhook-delivery endpoint, so
 * parseWebhookEvents is intentionally left unimplemented (the router returns
 * 501 Not Implemented for it).
 *
 * Docs: https://doc.webdoxclm.com/docs/v2/en/index.html
 */

import { customForm, pageLocally, type Credentials, type QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import { exchangeCredentials as webdoxExchange, refreshCredentials as webdoxRefresh } from './auth'
import { WebdoxClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawWebdoxWorkflow } from './transform/envelope'
import { transformSigner, type RawWebdoxSigner } from './transform/signer'
import { transformDocument, type RawWebdoxDocument } from './transform/document'
import { transformTemplate, type RawWebdoxTemplate } from './transform/template'
import { transformAuditTrailEntry, type RawWebdoxAuditEntry } from './transform/audit-trail-entry'

// Connect Link credential form: Webdox issues bearer tokens from an account
// email + password (+ optional `customer` environment slug for multi-env users).
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'Account email',
      type: 'email',
      required: true,
      helpText: 'The Webdox CLM user email the API token is issued for.',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
    {
      name: 'customer',
      label: 'Environment',
      type: 'text',
      required: false,
      helpText: 'Customer environment slug. Required only for multi-environment accounts.',
    },
  ],
  exchange: (fields) =>
    webdoxExchange(
      (fields['username'] ?? '').trim(),
      fields['password'] ?? '',
      (fields['customer'] ?? '').trim() || undefined,
    ),
})

interface WorkflowListResponse {
  decision_workflows?: RawWebdoxWorkflow[]
  workflows?: RawWebdoxWorkflow[]
}

interface WorkflowDetailResponse {
  decision_workflow?: RawWebdoxWorkflow
}

/**
 * One entry of "List steps" (GET /api/v2/decision_workflows/<ID>/steps), which
 * answers with a bare array. Only the fields the adapter reads are declared.
 */
interface RawWebdoxStep {
  id_number: number
  id_parallel: number
  step_type?: string | null
}

/** "Workflow Info" (GET /api/v2/decision_workflows/:id): the `documents` it carries. */
interface WorkflowInfoDocuments {
  documents?: RawWebdoxDocument[]
}

interface TemplatesResponse {
  templates?: RawWebdoxTemplate[]
}

interface TemplateDetailResponse {
  template?: RawWebdoxTemplate
}

interface AuditListResponse {
  activities?: RawWebdoxAuditEntry[]
  audit?: RawWebdoxAuditEntry[]
  data?: RawWebdoxAuditEntry[]
}

export class WebdoxAdapter implements DocsignAdapter {
  readonly platform = 'webdox'
  readonly version = '0.1.0'

  // Connect Link support — email + password + environment form (api_key flow).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  constructor() {
    // Webdox uses the credential-form (password-grant) flow.
    // No OAuth client config (clientId / clientSecret / redirectUri) is required
    // or accepted — those fields do not apply to this integration.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'Webdox CLM does not support browser OAuth. Use the Connect Link credential form (email + password + environment).',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Webdox CLM does not support the authorization-code grant. Use exchangeCredentials.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return webdoxRefresh(credentials)
  }

  private client(credentials: Credentials): WebdoxClient {
    return new WebdoxClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    return out
  }

  // ── Envelopes (decision workflows) ────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<WorkflowListResponse>(
      '/decision_workflows',
      this.listParams(params),
    )
    const workflows = res.decision_workflows ?? res.workflows ?? []
    return workflows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<RawWebdoxWorkflow | WorkflowDetailResponse>(
      `/decision_workflows/${id}`,
    )
    const workflow = (res as WorkflowDetailResponse).decision_workflow ?? (res as RawWebdoxWorkflow)
    return transformEnvelope(workflow)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/decision_workflows/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (gathered across the workflow's signature steps) ──────────────

  /**
   * "List steps" (GET /decision_workflows/<ID>/steps) and, for each step whose
   * `step_type` is "signature", "Get all signers from a decision workflow
   * step" (GET /decision_workflows/<WF_ID>/steps/<STEP_NUMBER>/signers
   * ?parallel_number=<PARALLEL_STEP_NUMBER>). Both answer with a bare array
   * and document no paging, so the whole set is read and paged locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const client = this.client(credentials)
    const steps = await client.get<RawWebdoxStep[]>(`/decision_workflows/${envelopeId}/steps`)
    const all: Signer[] = []
    for (const step of steps) {
      if (step.step_type !== 'signature') continue
      const signers = await client.get<RawWebdoxSigner[]>(
        `/decision_workflows/${envelopeId}/steps/${step.id_number}/signers`,
        { parallel_number: step.id_parallel },
      )
      for (const raw of signers) all.push(transformSigner(raw, envelopeId))
    }
    return pageLocally(all, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.split(':')
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on workflow ${envelopeId}`)
    return found
  }

  // ── Documents (workflow documents, metadata only) ─────────────────────────

  /**
   * The workflow's `documents` from "Workflow Info"
   * (GET /decision_workflows/:id). GET /decision_workflows/<ID>/documents is
   * "Download documents": a bare array of { <id>: <url> } download links, not
   * document metadata. Workflow Info documents no paging, so the whole set is
   * paged locally.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<WorkflowInfoDocuments>(
      `/decision_workflows/${envelopeId}`,
    )
    const all = (res.documents ?? []).map((raw, i) => transformDocument(raw, envelopeId, i))
    return pageLocally(all, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.split(':')
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on workflow ${envelopeId}`)
    return found
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<RawWebdoxTemplate | TemplateDetailResponse>(
      `/templates/${id}`,
    )
    const template = (res as TemplateDetailResponse).template ?? (res as RawWebdoxTemplate)
    return transformTemplate(template)
  }

  // ── Audit trail (GET /api/v2/audit — global activity log) ─────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    _envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<AuditListResponse | RawWebdoxAuditEntry[]>(
      '/audit',
      this.listParams(params),
    )
    const entries: RawWebdoxAuditEntry[] = Array.isArray(res)
      ? res
      : (res as AuditListResponse).activities ??
        (res as AuditListResponse).audit ??
        (res as AuditListResponse).data ??
        []
    return entries.map((raw, i) => transformAuditTrailEntry(raw, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    // The /audit endpoint does not expose a per-entry GET; retrieve the page
    // and locate by externalId. id may be "<index>" or the raw entry id.
    const [indexStr] = id.split(':')
    if (!indexStr) throw new Error('Webdox audit-trail id expects a numeric index or entry id')
    const all = await this.listAuditTrailEntries(credentials, '', {})
    const found = all.find((e) => e.externalId === id || e.externalId === indexStr)
    if (!found) throw new Error(`Webdox audit entry ${id} not found`)
    return found
  }
}
