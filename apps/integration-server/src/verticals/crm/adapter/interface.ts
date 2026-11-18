export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'
import type { Contact } from '../schema/contact'
import type { Company } from '../schema/company'
import type { Deal } from '../schema/deal'
import type { Pipeline } from '../schema/pipeline'
import type { Activity } from '../schema/activity'
import type { Note } from '../schema/note'
import type { WebhookEvent } from '../schema/webhook'

/**
 * CrmAdapter — extends BaseAdapter with CRM-specific resource methods.
 *
 * Auth and webhook methods are inherited from BaseAdapter. All resource methods
 * are optional so platform adapters can stub whatever their platform doesn't
 * support (the registry returns 501 for missing methods automatically).
 *
 * Reference implementation: `src/adapters/pipedrive/`.
 */
export interface CrmAdapter extends BaseAdapter {
  // Webhooks (refined return type)
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Contacts ───────────────────────────────────────────────────────────────
  listContacts?(credentials: Credentials, params: QueryParams): Promise<Contact[]>
  getContact?(credentials: Credentials, id: string): Promise<Contact>
  createContact?(credentials: Credentials, data: Partial<Contact>): Promise<Contact>
  updateContact?(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact>
  deleteContact?(credentials: Credentials, id: string): Promise<void>

  // ── Companies ──────────────────────────────────────────────────────────────
  listCompanies?(credentials: Credentials, params: QueryParams): Promise<Company[]>
  getCompany?(credentials: Credentials, id: string): Promise<Company>
  createCompany?(credentials: Credentials, data: Partial<Company>): Promise<Company>
  updateCompany?(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company>
  deleteCompany?(credentials: Credentials, id: string): Promise<void>

  // ── Deals ──────────────────────────────────────────────────────────────────
  listDeals?(credentials: Credentials, params: QueryParams): Promise<Deal[]>
  getDeal?(credentials: Credentials, id: string): Promise<Deal>
  createDeal?(credentials: Credentials, data: Partial<Deal>): Promise<Deal>
  updateDeal?(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal>
  deleteDeal?(credentials: Credentials, id: string): Promise<void>

  // ── Pipelines (read-only — pipeline config is admin-managed) ──────────────
  listPipelines?(credentials: Credentials, params: QueryParams): Promise<Pipeline[]>
  getPipeline?(credentials: Credentials, id: string): Promise<Pipeline>

  // ── Activities ─────────────────────────────────────────────────────────────
  listActivities?(credentials: Credentials, params: QueryParams): Promise<Activity[]>
  getActivity?(credentials: Credentials, id: string): Promise<Activity>
  createActivity?(credentials: Credentials, data: Partial<Activity>): Promise<Activity>
  updateActivity?(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity>
  deleteActivity?(credentials: Credentials, id: string): Promise<void>

  // ── Notes ──────────────────────────────────────────────────────────────────
  listNotes?(credentials: Credentials, params: QueryParams): Promise<Note[]>
  getNote?(credentials: Credentials, id: string): Promise<Note>
  createNote?(credentials: Credentials, data: Partial<Note>): Promise<Note>
  updateNote?(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note>
  deleteNote?(credentials: Credentials, id: string): Promise<void>
}
