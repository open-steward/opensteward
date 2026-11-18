/**
 * LibreSign adapter — self-hosted Nextcloud document signing.
 *
 * LibreSign treats a "file" as the unit of work: it bundles the PDF, the
 * per-signer sign-requests, and the workflow status. The adapter maps:
 *   file (file/list, file/validate) → canonical Envelope
 *   the signers[] on a validated file → canonical Signer
 *   the file itself → canonical Document (metadata only; no content)
 *   the file + signer lifecycle timestamps → synthesised AuditTrailEntry
 *
 * LibreSign has no template API and no envelope-void endpoint, so
 * listTemplates/getTemplate and voidEnvelope are intentionally absent (the
 * router returns 501 for them). It exposes no verifiable signed webhook —
 * only a fire-and-forget `callback` registration — so no webhook handling is
 * wired here.
 *
 * Auth is the `api_key` model: a Nextcloud app password used as HTTP Basic,
 * collected through the Connect Link form (server URL + username + app
 * password). There is no OAuth flow.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: template — LibreSign has no template API; the platform manages
 *   documents as one-off signing requests and exposes no /template route or
 *   equivalent (confirmed via libresign.github.io docs + controller listing).
 */

import { LIBRESIGN_CREDENTIAL_FORM } from './auth'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import { LibreSignClient } from './client'
import { DEFAULT_PAGE_SIZE, FILE_STATUS } from './constants'

import { transformEnvelope, type RawLibreSignFile } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'
import { toIso } from './transform/shared'

export interface LibresignAdapterConfig {
  /** Present for parity with OAuth adapters; unused by LibreSign's api_key flow. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * `GET file/list` → `ocs.data`: `FileListResponse` { pagination, data[] }.
 * `Pagination` is { total, current, next, prev, last, first }, the links being
 * `string | null` (https://raw.githubusercontent.com/LibreSign/libresign/main/openapi.json).
 */
interface FileListResponse {
  data?: RawLibreSignFile[]
  pagination?: {
    total?: number
    current?: string | null
    next?: string | null
    prev?: string | null
    last?: string | null
    first?: string | null
  }
}

const NO_OAUTH =
  'LibreSign does not use OAuth. Connect via the app-password credential form (api_key).'

export class LibresignAdapter implements DocsignAdapter {
  readonly platform = 'libresign'
  readonly version = '0.1.0'

  // ── Connect Link (api_key): server URL + username + app password ──────────
  credentialFields = LIBRESIGN_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = LIBRESIGN_CREDENTIAL_FORM.exchangeCredentials

  constructor(_config: LibresignAdapterConfig = {}) {}

  // ── Auth (required by BaseAdapter; LibreSign has no OAuth) ─────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(NO_OAUTH)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(NO_OAUTH)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // App passwords don't expire; return the stored credentials unchanged.
    return credentials
  }

  private client(credentials: Credentials): LibreSignClient {
    return new LibreSignClient(credentials)
  }

  /**
   * `file-list` documents `page` ("the number of page to return") and
   * `length` ("Total of elements to return") with no maximum, so the
   * caller's page and exact limit pass straight through.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      length: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status'] !== undefined) out['status[]'] = [Number(params['status'])]
    return out
  }

  private async validateFile(
    credentials: Credentials,
    uuid: string,
  ): Promise<RawLibreSignFile> {
    return this.client(credentials).get<RawLibreSignFile>(`/file/validate/uuid/${uuid}`)
  }

  // ── Envelopes (LibreSign files) ───────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<FileListResponse>(
      '/file/list',
      this.listParams(params),
    )
    // lib/Helper/Pagination.php sets `next` to a link only while
    // `hasNextPage()`, and every link to null when `$total <= $length`.
    const pagination = res.pagination
    if (pagination && 'next' in pagination) {
      reportUpstreamPage(params, {
        hasMore: typeof pagination.next === 'string' && pagination.next.length > 0,
        ...(typeof pagination.total === 'number' ? { totalCount: pagination.total } : {}),
      })
    }
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.validateFile(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (sign-requests on a file) ─────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.validateFile(credentials, envelopeId)
    // `GET file/validate/uuid/{uuid}` returns the file with every signer and
    // takes no paging parameter (LibreSign openapi.json), so page it here.
    return pageLocally(
      (raw.signers ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signRequestId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signRequestId) {
      throw new Error('getSigner expects an id of shape "<envelopeUuid>:<signRequestId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signRequestId)
    if (!found) throw new Error(`Signer ${signRequestId} not found on file ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.validateFile(credentials, envelopeId)
    // The validated file is the whole collection: one document, no upstream page.
    return pageLocally([transformDocument(raw, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // LibreSign files are single-document; the document id equals the file uuid.
    const envelopeId = id.includes(':') ? (id.split(':')[0] as string) : id
    const raw = await this.validateFile(credentials, envelopeId)
    return transformDocument(raw, envelopeId)
  }

  // ── Audit-trail entries — synthesised from the file + signer lifecycle ────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.validateFile(credentials, envelopeId)
    const events: SyntheticAuditEvent[] = []

    const createdAt = toIso(raw.created_at)
    if (createdAt) {
      events.push({
        envelopeId,
        occurredAt: createdAt,
        type: 'created',
        description: 'Signature request created',
        actorId: raw.requested_by?.userId ?? undefined,
        actorName: raw.requested_by?.displayName ?? undefined,
      })
    }

    for (const sig of raw.signers ?? []) {
      const requestedAt = toIso(sig.request_sign_date)
      if (requestedAt) {
        events.push({
          envelopeId,
          occurredAt: requestedAt,
          type: 'sent',
          description: 'Signature requested from signer',
          actorEmail: sig.email ?? undefined,
          actorName: sig.displayName ?? undefined,
          actorId: sig.userId ?? undefined,
        })
      }
      const signedAt = toIso(sig.sign_date ?? sig.signed)
      if (signedAt) {
        events.push({
          envelopeId,
          occurredAt: signedAt,
          type: 'signed',
          description: 'Signer signed the document',
          actorEmail: sig.email ?? undefined,
          actorName: sig.displayName ?? undefined,
          actorId: sig.userId ?? undefined,
          actorIp: sig.remote_address,
          extra: { signRequestId: sig.signRequestId, userAgent: sig.user_agent },
        })
      }
    }

    if (raw.status === FILE_STATUS.SIGNED) {
      const signDates = (raw.signers ?? [])
        .map((s) => toIso(s.sign_date ?? s.signed))
        .filter((d): d is string => typeof d === 'string')
        .sort()
      const completedAt = signDates[signDates.length - 1] ?? createdAt
      if (completedAt) {
        events.push({
          envelopeId,
          occurredAt: completedAt,
          type: 'completed',
          description: 'All signers completed; document fully signed',
        })
      }
    }

    events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    // Synthesised from one validated file, which takes no paging parameter:
    // number every event first so ids stay stable, then page locally.
    return pageLocally(
      events.map((e, i) => transformAuditTrailEntry(e, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeUuid>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
