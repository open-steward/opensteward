/**
 * Jotform Sign adapter.
 *
 * Jotform Sign has no dedicated e-signature REST surface — a Sign document is
 * a form whose `type` is `SIGN`, and each completed signature is a submission
 * against that form. This adapter maps:
 *
 *   form (type=SIGN)                  → canonical `Envelope`
 *   submission                        → canonical `Signer`
 *   form + submission timestamps      → synthesised `AuditTrailEntry`
 *
 * Documents (no per-document metadata endpoint) and Templates (no stable
 * documented REST endpoint) are intentionally NOT implemented; the router
 * returns 501 for those resources.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: document  — Jotform Sign has no per-document metadata endpoint;
 *              the REST API only exposes file-upload URLs from submissions, not
 *              the canonical fields (name, sizeBytes, pageCount, mimeType).
 * Unavailable: template  — Jotform Sign has no documented REST endpoint for
 *              templates; Jotform support has confirmed Sign API support is not
 *              yet available (https://api.jotform.com/docs/).
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Auth is a static API key sent in the `APIKEY` header, collected via the
 * Connect Link credential form; there is no OAuth flow, so `getAuthUrl` /
 * `exchangeCode` throw. There is no documented webhook signature scheme, so no
 * `verifyWebhook` / `parseWebhookEvents` are implemented.
 *
 * Docs: https://api.jotform.com/docs/
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import { FORM } from './auth'
import { JotformSignClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SIGN_FORM_TYPE } from './constants'

import { transformEnvelope, type RawJotformForm } from './transform/envelope'
import { transformSigner, type RawJotformSubmission } from './transform/signer'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export class JotformSignAdapter implements DocsignAdapter {
  readonly platform = 'jotform-sign'
  readonly version = '0.1.0'

  // ── Auth — API key only (no OAuth) ────────────────────────────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('jotform-sign uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('jotform-sign uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API keys don't expire or refresh.
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  private client(credentials: Credentials): JotformSignClient {
    return new JotformSignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const page = Math.max(Number(params.page ?? 1), 1)
    const out: Record<string, unknown> = {
      limit,
      offset: (page - 1) * limit,
    }
    if (params['orderby']) out.orderby = String(params['orderby'])
    return out
  }

  private isSignForm(form: RawJotformForm): boolean {
    return (form.type ?? '').toUpperCase() === SIGN_FORM_TYPE
  }

  // ── Envelopes (Jotform Sign forms, type=SIGN) ─────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const forms = await this.client(credentials).get<RawJotformForm[]>(
      '/user/forms',
      this.listParams(params),
    )
    return (forms ?? [])
      .filter((f) => this.isSignForm(f))
      .map((f) => transformEnvelope(f))
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const client = this.client(credentials)
    const form = await client.get<RawJotformForm>(`/form/${id}`)
    if (!form || !form.id) throw new Error(`Jotform form ${id} not found`)
    // Thread the submission ids in as signerIds so the envelope advertises its
    // signers without a second round-trip on the caller's part.
    const submissions = await client.get<RawJotformSubmission[]>(`/form/${id}/submissions`, {
      limit: MAX_PAGE_SIZE,
    })
    const signerIds = (submissions ?? []).map((s) => s.id)
    return transformEnvelope(form, signerIds)
  }

  // ── Signers (submissions on a Sign form) ──────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const submissions = await this.client(credentials).get<RawJotformSubmission[]>(
      `/form/${envelopeId}/submissions`,
      this.listParams(params),
    )
    return (submissions ?? []).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Jotform submission ids are globally addressable via /submission/{id}.
    const submission = await this.client(credentials).get<RawJotformSubmission>(
      `/submission/${id}`,
    )
    if (!submission || !submission.id) throw new Error(`Jotform submission ${id} not found`)
    return transformSigner(submission, submission.form_id ?? '')
  }

  // ── Audit-trail entries — synthesised from form + submission timestamps ───

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const client = this.client(credentials)
    const form = await client.get<RawJotformForm>(`/form/${envelopeId}`)
    if (!form || !form.id) throw new Error(`Jotform form ${envelopeId} not found`)
    const submissions = await client.get<RawJotformSubmission[]>(
      `/form/${envelopeId}/submissions`,
      { limit: MAX_PAGE_SIZE },
    )

    const events: SyntheticAuditEvent[] = []
    if (form.created_at) {
      events.push({
        envelopeId,
        occurredAt: form.created_at,
        type: 'created',
        description: 'Sign document created',
      })
    }
    for (const sub of submissions ?? []) {
      const signer = transformSigner(sub, envelopeId)
      events.push({
        envelopeId,
        occurredAt: sub.created_at,
        type: 'signed',
        signerEmail: signer.email || undefined,
        signerName: signer.name || undefined,
        submissionId: sub.id,
        actorIp: sub.ip,
        description: 'Signer completed and signed the document',
      })
    }
    if ((submissions ?? []).length > 0 && form.last_submission) {
      events.push({
        envelopeId,
        occurredAt: form.last_submission,
        type: 'completed',
        description: 'Most recent signature recorded',
      })
    }

    events.sort((a, b) => {
      const at = a.occurredAt ? Date.parse(a.occurredAt.replace(' ', 'T')) : 0
      const bt = b.occurredAt ? Date.parse(b.occurredAt.replace(' ', 'T')) : 0
      return at - bt
    })
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
