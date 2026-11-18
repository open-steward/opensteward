/**
 * Lleida.net Click & Sign adapter.
 *
 * Maps a Click & Sign signature process → canonical `Envelope` (the signature
 * IS the envelope — there is no separate envelopes resource), its `signatory`
 * array → `Signer`, the `get_file_list` manifest → `Document` (metadata only),
 * and the signature/signatory status timestamps → synthesised
 * `AuditTrailEntry` rows.
 *
 * Click & Sign has no template concept (configs are callback/branding
 * settings, not document templates), so `listTemplates`/`getTemplate` are left
 * unimplemented and auto-501. Webhook callbacks carry no documented signature
 * scheme, so no webhook methods are exposed.
 *
 * Auth is a static API key (`Authorization: x-api-key <key>`) + account `user`,
 * collected via the Connect Link form; there is no OAuth flow, so
 * `getAuthUrl`/`exchangeCode` throw.
 *
 * Docs: https://api.lleida.net/dtd/clickandsign/v1/en/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: template — Click & Sign has no document-template resource;
//   GET_CONFIG / GET_CONFIG_LIST return branding/callback workflow configs,
//   not reusable templates with signer roles or document attachments.

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import { FORM } from './auth'
import { LleidaNetClient, type ClickAndSignEnvelope } from './client'
import { DEFAULT_LOOKBACK_DAYS } from './constants'

import {
  transformEnvelope,
  signatoriesOf,
  type RawLleidaNetSignature,
} from './transform/envelope'
import { transformSigner, type RawLleidaNetSignatory } from './transform/signer'
import { transformDocument, type RawLleidaNetFile } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export interface LleidaNetAdapterConfig {
  clientId: string
  /** Treated as the API key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface SignatureListResponse extends ClickAndSignEnvelope {
  signature?: RawLleidaNetSignature[]
}

interface SignatoryDetailsResponse extends ClickAndSignEnvelope {
  signatory_details?: RawLleidaNetSignatory
}

/** GET_FILE_LIST response: the rows sit under `file_list.files`. */
interface FileListResponse extends ClickAndSignEnvelope {
  file_list?: {
    signature_id?: string
    files?: RawLleidaNetFile[]
  }
}

export class LleidaNetAdapter implements DocsignAdapter {
  readonly platform = 'lleida-net'
  readonly version = '0.1.0'

   
  private clientId: string
  private clientSecret: string
   
  private redirectUri: string
   
  private scopes: string[]

  constructor(config: LleidaNetAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('lleida-net uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('lleida-net uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  private client(credentials: Credentials): LleidaNetClient {
    return new LleidaNetClient(credentials)
  }

  /**
   * Build the `get_signature_list` query. The window defaults to the last
   * DEFAULT_LOOKBACK_DAYS (Click & Sign caps the interval at 31 days) and is
   * narrowed by `updatedAfter`/`status` when supplied.
   */
  private listBody(params: QueryParams): Record<string, unknown> {
    const nowSec = Math.floor(Date.now() / 1000)
    const fromDefault = nowSec - DEFAULT_LOOKBACK_DAYS * 86_400
    const startSec =
      params.updatedAfter instanceof Date
        ? Math.floor(params.updatedAfter.getTime() / 1000)
        : params['start_date']
          ? Number(params['start_date'])
          : fromDefault
    const body: Record<string, unknown> = {
      start_date: startSec,
      end_date: params['end_date'] ? Number(params['end_date']) : nowSec,
    }
    if (params['signature_status']) body.signature_status = String(params['signature_status'])
    else if (params['status']) body.signature_status = String(params['status'])
    if (params['config_id']) body.config_id = params['config_id']
    return body
  }

  private async fetchSignature(
    credentials: Credentials,
    signatureId: string,
  ): Promise<RawLleidaNetSignature> {
    const res = await this.client(credentials).call<SignatureListResponse>('get_signature_list', {
      signature_id: signatureId,
    })
    const found = (res.signature ?? []).find((s) => String(s.signature_id) === signatureId)
    if (!found) throw new Error(`Signature ${signatureId} not found`)
    return found
  }

  // ── Envelopes (signature processes) ────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    // get_signature_list has no page, limit or offset field: it returns every
    // signature in the (max 31-day) window, so the window is paged here.
    const res = await this.client(credentials).call<SignatureListResponse>(
      'get_signature_list',
      this.listBody(params),
    )
    return pageLocally((res.signature ?? []).map(transformEnvelope), params)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchSignature(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).call('cancel_signature', { signature_id: id })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (signatories on a signature) ───────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const signature = await this.fetchSignature(credentials, envelopeId)
    return signatoriesOf(signature).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signatoryId] = id.includes(':') ? id.split(':') : ['', id]
    if (!signatoryId) {
      throw new Error('getSigner expects an id of shape "<signatureId>:<signatoryId>" or "<signatoryId>"')
    }
    const res = await this.client(credentials).call<SignatoryDetailsResponse>(
      'get_signatory_details',
      { signatory_id: signatoryId },
    )
    const details = res.signatory_details
    if (!details) throw new Error(`Signatory ${signatoryId} not found`)
    const resolvedEnvelopeId =
      envelopeId || (details.signature_id != null ? String(details.signature_id) : '')
    return transformSigner(details, resolvedEnvelopeId)
  }

  // ── Documents (file manifest — content REFUSED) ────────────────────────────

  /**
   * GET_FILE_LIST for one signature, restricted to `file_group: START_FILES`
   * ("all files sent in the element file in the START_SIGNATURE API") so the
   * signature evidence and signatory uploads the unfiltered call also returns
   * are not surfaced as envelope documents. The request has no page, limit or
   * offset field, so every file comes back at once.
   * Docs: https://api.lleida.net/dtd/clickandsign/v1/en/
   */
  private async fetchDocuments(credentials: Credentials, envelopeId: string): Promise<Document[]> {
    const res = await this.client(credentials).call<FileListResponse>('get_file_list', {
      signature_id: envelopeId,
      file_group: 'START_FILES',
    })
    return (res.file_list?.files ?? []).map((raw, i) => transformDocument(raw, envelopeId, i))
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return pageLocally(await this.fetchDocuments(credentials, envelopeId), params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, fileId] = id.split(':')
    if (!envelopeId || !fileId) {
      throw new Error('getDocument expects an id of shape "<signatureId>:<fileId>"')
    }
    const all = await this.fetchDocuments(credentials, envelopeId)
    const found = all.find((d) => d.externalId === fileId)
    if (!found) throw new Error(`Document ${fileId} not found on signature ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from status timestamps ───────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const signature = await this.fetchSignature(credentials, envelopeId)
    const events: SyntheticAuditEvent[] = []
    if (signature.signature_start_date != null) {
      events.push({
        envelopeId,
        occurredUnix: signature.signature_start_date,
        type: 'created',
        description: 'Signature process started',
      })
    }
    for (const sig of signatoriesOf(signature)) {
      const signatoryId = String(sig.signatory_id)
      const name = [sig.name ?? sig.signatory_name, sig.surname ?? sig.signatory_surname]
        .filter(Boolean)
        .join(' ')
        .trim()
      const email = sig.email ?? sig.signatory_email
      const status = (sig.signatory_status ?? '').toLowerCase()
      if (sig.signatory_landing_date != null) {
        events.push({
          envelopeId,
          occurredUnix: sig.signatory_landing_date,
          type: 'viewed',
          description: 'Signatory accessed the document',
          signatoryId,
          actorName: name || undefined,
          actorEmail: email,
          actorIp: sig.ip,
        })
      }
      if (sig.signatory_status_date != null) {
        const type =
          status === 'signed' || status === 'completed'
            ? 'signed'
            : status === 'rejected' || status === 'declined'
              ? 'declined'
              : 'other'
        events.push({
          envelopeId,
          occurredUnix: sig.signatory_status_date,
          type,
          description: `Signatory status: ${sig.signatory_status ?? 'updated'}`,
          signatoryId,
          actorName: name || undefined,
          actorEmail: email,
          actorIp: sig.ip,
        })
      }
    }
    if (
      (signature.signature_status ?? '').toLowerCase() === 'completed' &&
      signature.signature_status_date != null
    ) {
      events.push({
        envelopeId,
        occurredUnix: signature.signature_status_date,
        type: 'completed',
        description: 'Signature process completed',
      })
    }
    events.sort((a, b) => Number(a.occurredUnix) - Number(b.occurredUnix))
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<signatureId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
