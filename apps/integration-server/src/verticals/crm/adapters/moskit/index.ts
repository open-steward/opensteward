/**
 * Moskit CRM adapter for the CRM vertical.
 *
 * Maps the Moskit (now Ollow) REST API v2 to canonical CRM resources.
 * Docs: https://developers.moskitcrm.com/ (302 to moskit.stoplight.io). The
 * OpenAPI export is
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/reference/openapi.yaml
 * and its models live under .../nodes/models/<Name>.v2.yaml.
 *
 * Auth: API key sent as the `apikey` header.
 * Base URL: https://api.ms.prod.ollow.services/v2 (see constants.ts).
 *
 * ── Paging ───────────────────────────────────────────────────────────────────
 * Every list takes `start` (row offset, default 0) and `quantity` (default 10,
 * max 50), and answers with a bare JSON array plus an `X-Ollow-Listing-Total`
 * header. The article adds that `start + quantity` must be below 10,000; past
 * that the API answers 422 and only `nextPageToken` reaches further rows. The
 * adapter pages by offset only, so a page that starts past that ceiling
 * surfaces the vendor's 422 instead of a silently short collection.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 * Reads: contacts (/contacts), companies (/companies), deals (/deals),
 * activities (/activities), pipelines (/pipelines, with their stages from
 * /stages). Notes have no top-level list: they are read from
 * /deals|contacts|companies/{id}/notes, and their ids carry the parent.
 *
 * Writes are unchanged and NOT verified against the docs: createContact,
 * updateContact and deleteContact still call /people (the documented path is
 * /contacts), and createNote/updateNote/deleteNote call a top-level /notes
 * that the spec does not have. Their request bodies are the old guessed shapes.
 * updateNote and deleteNote are handed the composite `<kind>:<parentId>:<noteId>`
 * ids that listNotes and getNote return, and put them into that path as-is.
 *
 * Offset paging sends no `sort`: the article allows only "O `key` de um campo,
 * desde que seja um campo `sortable` nos resultados do endpoint
 * `GET /<entidade>/search`", which cannot be checked without an account, and
 * it documents no default order. Page N is stable only if that order is.
 */

import {
  connectionScope,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { MoskitClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawMoskitContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawMoskitCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawMoskitDeal } from './transform/deal'
import {
  transformPipeline,
  type RawMoskitPipeline,
  type RawMoskitStage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawMoskitActivity,
} from './transform/activity'
import {
  parseNoteId,
  transformNote,
  untransformNote,
  type MoskitNoteParentKind,
  type RawMoskitNote,
} from './transform/note'

export interface MoskitAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/** The parents notes are listed under, in the order listNotes streams them. */
const NOTE_PARENTS: ReadonlyArray<{ kind: MoskitNoteParentKind; path: string }> = [
  { kind: 'deal', path: '/deals' },
  { kind: 'contact', path: '/contacts' },
  { kind: 'company', path: '/companies' },
]

/** Where listNotes' stream is: one page of parents of one kind. */
interface NoteCursor {
  parent: number
  start: number
}

export class MoskitAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'moskit'
  readonly version = '0.1.0'

  /** "quantity | Quantidade de registros para receber da busca | 10 | 50" */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: MoskitAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Moskit: use API key auth — set accessToken directly')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private c(creds: Credentials): MoskitClient {
    return new MoskitClient(creds)
  }

  /**
   * One caller page of a top-level list: `start` = (page − 1) × quantity,
   * `quantity` = the caller's limit clamped to 50. `hasMore` comes from the
   * `X-Ollow-Listing-Total` header; without it nothing is reported.
   */
  private async listTop<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<R[]> {
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const quantity = Math.max(1, Math.min(Math.floor(requested), MAX_PAGE_SIZE))
    const start = pageOffset(params, quantity)
    const { items, total } = await this.c(credentials).listPage<R>(path, { start, quantity })
    reportUpstreamPage(params, {
      ...(total !== undefined ? { totalCount: total, hasMore: start + items.length < total } : {}),
      ...(quantity < requested ? { pageSize: quantity } : {}),
    })
    return items
  }

  /**
   * Every row of a list, 50 at a time, until `X-Ollow-Listing-Total` rows are
   * in hand (or a short page ends it when the header is absent).
   */
  private async listAll<R>(client: MoskitClient, path: string): Promise<R[]> {
    const rows: R[] = []
    for (let start = 0; ; start += MAX_PAGE_SIZE) {
      const { items, total } = await client.listPage<R>(path, { start, quantity: MAX_PAGE_SIZE })
      rows.push(...items)
      if (items.length === 0) return rows
      if (total !== undefined ? start + items.length >= total : items.length < MAX_PAGE_SIZE)
        return rows
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /** GET /contacts — "Lista de contatos" (operationId get-contacts). */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listTop<RawMoskitContact>(credentials, '/contacts', params)
    return rows.map(transformContact)
  }

  /** GET /contacts/{id} — "Busca contato pelo ID". */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawMoskitContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawMoskitContact>(
      '/people',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.c(credentials).put<RawMoskitContact>(
      `/people/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/people/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  /** GET /companies — "Lista de empresas". */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.listTop<RawMoskitCompany>(credentials, '/companies', params)
    return rows.map(transformCompany)
  }

  /** GET /companies/{id} — "Busca de empresa". */
  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawMoskitCompany>(
      `/companies/${encodeURIComponent(id)}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawMoskitCompany>(
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
    const raw = await this.c(credentials).put<RawMoskitCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /** GET /deals — "Lista de negócios". */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.listTop<RawMoskitDeal>(credentials, '/deals', params)
    return rows.map(transformDeal)
  }

  /** GET /deals/{id} — "Busca negócio pelo ID". */
  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawMoskitDeal>(`/deals/${encodeURIComponent(id)}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawMoskitDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawMoskitDeal>(`/deals/${id}`, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * GET /pipelines — "Lista de funis dos negócios". Pipeline.v2.yaml has no
   * stages; they are GET /stages ("Lista de fases dos negócios"), each naming
   * its pipeline in `pipeline.id`, fetched whole and grouped.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const pipelines = await this.listTop<RawMoskitPipeline>(credentials, '/pipelines', params)
    if (pipelines.length === 0) return []
    const stages = await this.listAll<RawMoskitStage>(this.c(credentials), '/stages')
    return pipelines.map((p) => transformPipeline(p, stagesOf(stages, p.id)))
  }

  /** GET /pipelines/{id} — "Busca funil do negócio pelo ID", with its stages. */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const client = this.c(credentials)
    const raw = await client.get<RawMoskitPipeline>(`/pipelines/${encodeURIComponent(id)}`)
    const stages = await this.listAll<RawMoskitStage>(client, '/stages')
    return transformPipeline(raw, stagesOf(stages, raw.id))
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /** GET /activities — "Lista de atividades". */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.listTop<RawMoskitActivity>(credentials, '/activities', params)
    return rows.map(transformActivity)
  }

  /** GET /activities/{id} — "Busca atividade pelo ID". */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.c(credentials).get<RawMoskitActivity>(
      `/activities/${encodeURIComponent(id)}`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawMoskitActivity>(
      '/activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.c(credentials).put<RawMoskitActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * The spec has no top-level notes list, only "Lista de notas dos negócios"
   * (GET /deals/{dealId}/notes), "... dos contatos" and "... das empresas".
   * The stream is every deal's notes, then every contact's, then every
   * company's (project notes have no canonical parent and are left out). One
   * upstream page is one page of 50 parents with all of their notes, and
   * `pageByRows` cuts the caller's page out of it.
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const client = this.c(credentials)
    const key = `${connectionScope('moskit', credentials)}::notes::parents=${MAX_PAGE_SIZE}`
    const { items } = await pageByRows<Note, NoteCursor>(
      key,
      params,
      async (cursor) => {
        const at = cursor ?? { parent: 0, start: 0 }
        const parent = NOTE_PARENTS[at.parent]!
        const { items: parents, total } = await client.listPage<{ id: number }>(parent.path, {
          start: at.start,
          quantity: MAX_PAGE_SIZE,
        })
        const rows: Note[] = []
        for (const p of parents) {
          const pid = String(p.id)
          const notes = await this.listAll<RawMoskitNote>(
            client,
            `${parent.path}/${encodeURIComponent(pid)}/notes`,
          )
          for (const n of notes) rows.push(transformNote(n, { kind: parent.kind, id: pid }))
        }
        const more =
          parents.length > 0 &&
          (total !== undefined
            ? at.start + parents.length < total
            : parents.length >= MAX_PAGE_SIZE)
        const next: NoteCursor | undefined = more
          ? { parent: at.parent, start: at.start + MAX_PAGE_SIZE }
          : at.parent + 1 < NOTE_PARENTS.length
            ? { parent: at.parent + 1, start: 0 }
            : undefined
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * GET /deals/{dealId}/notes/{id} ("Busca nota do negócio pelo ID"), or the
   * contact or company equivalent, from the `<kind>:<parentId>:<noteId>` id
   * listNotes returns.
   */
  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const parsed = parseNoteId(id)
    if (!parsed) {
      throw Object.assign(
        new Error(
          `Moskit note id "${id}" is not <deal|contact|company>:<parentId>:<noteId>; Moskit reads a note only under its parent`,
        ),
        { statusCode: 404, code: 'NOT_FOUND' },
      )
    }
    const parent = NOTE_PARENTS.find((p) => p.kind === parsed.parent.kind)!
    const raw = await this.c(credentials).get<RawMoskitNote>(
      `${parent.path}/${encodeURIComponent(parsed.parent.id)}/notes/${encodeURIComponent(parsed.noteId)}`,
    )
    return transformNote(raw, parsed.parent)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawMoskitNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).put<RawMoskitNote>(`/notes/${id}`, untransformNote(data))
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/notes/${id}`)
  }
}

function stagesOf(stages: RawMoskitStage[], pipelineId: number): RawMoskitStage[] {
  return stages.filter(
    (s) => s.pipeline?.id != null && String(s.pipeline.id) === String(pipelineId),
  )
}
