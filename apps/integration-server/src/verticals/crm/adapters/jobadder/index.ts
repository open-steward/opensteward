/**
 * JobAdder adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * JobAdder is an ATS (Applicant Tracking System) with a REST API v2.
 * Canonical mapping:
 *   Candidate  → Contact   (/candidates, /candidates/{id})
 *   Company    → Company   (/companies, /companies/{id})
 *   Job order  → Deal      (/jobs, /jobs/{id})
 *   Note       → Note      (/candidates/{id}/notes, /jobs/{id}/notes)
 *   UserTask   → Activity  (/usertasks, /usertasks/{taskId}) — read-only
 *
 * Auth: OAuth2 Authorization Code flow.
 *   Authorize:  https://id.jobadder.com/connect/authorize
 *   Token:      https://id.jobadder.com/connect/token
 * Pagination: offset-based query params (Offset, Limit ≤ 1000); the envelope
 *   carries totalCount and links.next.
 *
 * Docs: https://api.jobadder.com/v2/docs
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: pipeline — JobAdder is an ATS, not a sales CRM; it has no
 *   deal pipeline concept. The workflow endpoints (/applications/lists/workflow,
 *   /companies/{id}/workflows) model approval flows, not configurable sales
 *   stage pipelines.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import { JobAdderClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import {
  transformContact,
  untransformContact,
  type RawJobAdderCandidate,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawJobAdderCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawJobAdderJob,
} from './transform/deal'
import {
  transformNote,
  untransformNote,
  parseNoteCompoundId,
  type RawJobAdderNote,
  type NoteParentContext,
} from './transform/note'
import {
  transformActivity,
  type RawJobAdderUserTask,
} from './transform/activity'
import { DEFAULT_JOBADDER_SCOPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface JobadderAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_JOBADDER_SCOPES when omitted. */
  scopes?: string[]
}

export class JobadderAdapter implements CrmAdapter {
  readonly platform = 'jobadder'
  readonly version = '0.1.0'
  /** Every list method sends Offset/Limit ≤ 1000 and reports its end. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: JobadderAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_JOBADDER_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('JobAdder exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      { clientId: this.clientId, clientSecret: this.clientSecret, redirectUri },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId =
      this.clientId ??
      (credentials.extra as Record<string, string> | undefined)?.['clientId'] ??
      ''
    const clientSecret =
      this.clientSecret ??
      (credentials.extra as Record<string, string> | undefined)?.['clientSecret'] ??
      ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): JobAdderClient {
    return new JobAdderClient(credentials)
  }

  /**
   * Fetch one caller page of a JobAdder list and report its end.
   *
   * JobAdder documents `Offset` ("The index of the first entry to return from
   * the resource collection") and `Limit` (maximum 1000) on every list
   * operation, spelled that way. The page size is the caller's limit clamped
   * to 1000, and the offset is `(page - 1) × size`. An explicit
   * `offset`/`cursor` param still wins, for callers that position directly.
   *
   * `hasMore` comes from the envelope's required `totalCount`, else from
   * `links.next`; with neither, nothing is claimed.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const l = Number(params.limit)
    const size =
      Number.isFinite(l) && l >= 1 ? Math.min(Math.floor(l), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
    const explicit = params['offset'] ?? params['cursor']
    const offset = explicit != null ? Number(explicit) : pageOffset(params, size)
    const { items, totalCount, hasNext } = await this.client(credentials).list<T>(path, {
      Offset: offset,
      Limit: size,
    })
    reportUpstreamPage(params, {
      hasMore: totalCount !== undefined ? offset + items.length < totalCount : hasNext,
      totalCount,
      pageSize: size,
    })
    return items
  }

  // ── Contacts (Candidates) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawJobAdderCandidate>(credentials, '/candidates', params)
    return items.map((raw) => transformContact(raw))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawJobAdderCandidate>(
      `/candidates/${id}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawJobAdderCandidate>(
      '/candidates',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawJobAdderCandidate>(
      `/candidates/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/candidates/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawJobAdderCompany>(credentials, '/companies', params)
    return items.map((raw) => transformCompany(raw))
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawJobAdderCompany>(
      `/companies/${id}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawJobAdderCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawJobAdderCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Job orders) ─────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawJobAdderJob>(credentials, '/jobs', params)
    return items.map((raw) => transformDeal(raw))
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawJobAdderJob>(`/jobs/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawJobAdderJob>(
      '/jobs',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawJobAdderJob>(
      `/jobs/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/jobs/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  /**
   * List notes for all candidates.
   *
   * JobAdder notes are scoped to a parent resource (candidate or job).
   * When no specific candidate/job is in params we list candidate notes
   * from the /candidates/{id}/notes endpoint by first fetching a page of
   * candidates and collecting their notes. As a convenience, if a
   * `candidateId` or `jobId` is present in params we scope directly.
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const candidateId = params['candidateId'] as string | undefined
    const jobId = params['jobId'] as string | undefined

    if (candidateId) {
      const ctx: NoteParentContext = { parentType: 'candidate', parentId: candidateId }
      const items = await this.listPage<RawJobAdderNote>(
        credentials,
        `/candidates/${candidateId}/notes`,
        params,
      )
      return items.map((raw) => transformNote(raw, ctx))
    }

    if (jobId) {
      const ctx: NoteParentContext = { parentType: 'job', parentId: jobId }
      const items = await this.listPage<RawJobAdderNote>(
        credentials,
        `/jobs/${jobId}/notes`,
        params,
      )
      return items.map((raw) => transformNote(raw, ctx))
    }

    // Fallback: return notes from the general notes endpoint if available,
    // otherwise return an empty array (avoids a 501 while still being safe).
    // Nothing is fetched, so the (empty) collection ends here.
    reportUpstreamPage(params, { hasMore: false, totalCount: 0 })
    return []
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    // The canonical Note.id is a compound string "candidate:{parentId}:{noteId}"
    // or "job:{parentId}:{noteId}" — see transformNote for the encoding.
    // JobAdder does not expose a flat /notes/{id} endpoint; notes are only
    // accessible via /candidates/{id}/notes/{noteId} or /jobs/{id}/notes/{noteId}.
    const parsed = parseNoteCompoundId(id)
    if (!parsed) {
      throw new Error(
        `JobAdder getNote: cannot route note id "${id}" — expected compound form "candidate:{parentId}:{noteId}" or "job:{parentId}:{noteId}"`,
      )
    }
    const path =
      parsed.parentType === 'candidate'
        ? `/candidates/${parsed.parentId}/notes/${parsed.noteId}`
        : `/jobs/${parsed.parentId}/notes/${parsed.noteId}`
    const raw = await this.client(credentials).get<RawJobAdderNote>(path)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const candidateId = data.contact_id
    const jobId = data.deal_id

    if (candidateId) {
      const ctx: NoteParentContext = { parentType: 'candidate', parentId: candidateId }
      const raw = await this.client(credentials).post<RawJobAdderNote>(
        `/candidates/${candidateId}/notes`,
        untransformNote(data),
      )
      return transformNote(raw, ctx)
    }

    if (jobId) {
      const ctx: NoteParentContext = { parentType: 'job', parentId: jobId }
      const raw = await this.client(credentials).post<RawJobAdderNote>(
        `/jobs/${jobId}/notes`,
        untransformNote(data),
      )
      return transformNote(raw, ctx)
    }

    throw new Error('JobAdder createNote: contact_id (candidateId) or deal_id (jobId) required')
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const parsed = parseNoteCompoundId(id)
    if (!parsed) {
      throw new Error(
        `JobAdder updateNote: cannot route note id "${id}" — expected compound form "candidate:{parentId}:{noteId}" or "job:{parentId}:{noteId}"`,
      )
    }
    const path =
      parsed.parentType === 'candidate'
        ? `/candidates/${parsed.parentId}/notes/${parsed.noteId}`
        : `/jobs/${parsed.parentId}/notes/${parsed.noteId}`
    const raw = await this.client(credentials).put<RawJobAdderNote>(
      path,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    const parsed = parseNoteCompoundId(id)
    if (!parsed) {
      throw new Error(
        `JobAdder deleteNote: cannot route note id "${id}" — expected compound form "candidate:{parentId}:{noteId}" or "job:{parentId}:{noteId}"`,
      )
    }
    const path =
      parsed.parentType === 'candidate'
        ? `/candidates/${parsed.parentId}/notes/${parsed.noteId}`
        : `/jobs/${parsed.parentId}/notes/${parsed.noteId}`
    await this.client(credentials).delete(path)
  }

  // ── Activities (UserTasks) ─────────────────────────────────────────────────
  //
  // JobAdder exposes user tasks at GET /usertasks and GET /usertasks/{taskId}.
  // These are the closest platform equivalent to the canonical Activity resource.
  // The public API v2 is read-only for tasks — create/update/delete are not
  // available, so only listActivities and getActivity are implemented.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawJobAdderUserTask>(credentials, '/usertasks', params)
    return items.map((raw) => transformActivity(raw))
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawJobAdderUserTask>(
      `/usertasks/${id}`,
    )
    return transformActivity(raw)
  }
}
