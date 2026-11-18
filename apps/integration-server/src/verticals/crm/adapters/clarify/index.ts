/**
 * Clarify adapter for the CRM vertical.
 *
 * Maps the Clarify REST API v1 to canonical CRM resources.
 * Docs: https://clarify-api-docs.vercel.app/
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 *   API key auth — header: `Authorization: api-key <key>`
 *   Workspace slug is also required (from the Clarify app URL or settings).
 *   credentials.accessToken  = api key
 *   credentials.extra.workspaceSlug = workspace slug
 *
 * ── Coverage ──────────────────────────────────────────────────────────────
 *
 * Implemented (13):
 *   Contacts (person): list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals: list, get, create, update, delete
 *   Activities (task): list, get, create, update, delete
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Pipelines — no dedicated pipeline-management endpoints exposed by Clarify
 *   Notes — Clarify exposes comments but no generic notes list/get API
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: pipeline — Clarify exposes no pipeline or stage management endpoints in its public API (v1); pipeline configuration is UI-only.

import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { WebhookEvent } from '../../schema/webhook'

import { ClarifyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawClarifyPerson,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawClarifyCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawClarifyDeal,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawClarifyTask,
} from './transform/activity'

// ── Credential form ──────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Settings > API Keys in your Clarify workspace (admin only).',
    },
    {
      name: 'workspaceSlug',
      label: 'Workspace slug',
      type: 'text',
      required: true,
      helpText: 'The slug from your Clarify workspace URL (e.g. app.clarify.ai/workspace/<slug>).',
    },
  ],
  async exchange(fields) {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const workspaceSlug = (fields['workspaceSlug'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!workspaceSlug) throw new Error('Workspace slug is required.')
    return {
      accessToken: apiKey,
      extra: { workspaceSlug },
    }
  },
})

// ── Adapter ──────────────────────────────────────────────────────────────────

export class ClarifyAdapter implements CrmAdapter {
  readonly platform = 'clarify'
  readonly version = '0.1.0'
  /** Every list method pages List resources at `page[limit]` up to 500. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Clarify uses API key + workspace slug, not OAuth.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not used for API-key auth; passthrough in case of direct credential injection.
    return { accessToken: code }
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

  private client(credentials: Credentials): ClarifyClient {
    return new ClarifyClient(credentials)
  }

  /**
   * One caller page of List resources, which pages by `page[limit]` (up to
   * 500) and `page[offset]`; `links.next` "is `null` on the last page".
   * The offset comes from the 1-based `page` at the size actually sent.
   * hasMore is read from `links.next`, else from `meta.total_records`.
   */
  private async listObjects<T>(
    credentials: Credentials,
    objectType: string,
    params: QueryParams,
  ): Promise<T[]> {
    const raw = Number(params.limit)
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).list<T>(objectType, {
      'page[limit]': size,
      'page[offset]': offset,
    })
    const data = res.data ?? []
    const total = res.meta?.total_records
    const hasMore =
      res.links && 'next' in res.links
        ? res.links.next != null
        : typeof total === 'number'
          ? offset + data.length < total
          : undefined
    reportUpstreamPage(params, {
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(typeof total === 'number' ? { totalCount: total } : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return data
  }

  // ── Contacts (person) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listObjects<RawClarifyPerson>(credentials, 'person', params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ data: RawClarifyPerson }>('person', id)
    const raw = (res as { data?: RawClarifyPerson }).data ?? (res as unknown as RawClarifyPerson)
    if (!raw?.id) {
      throw Object.assign(new Error(`Clarify: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const res = await this.client(credentials).create<{ data: RawClarifyPerson }>(
      'person',
      untransformContact(data),
    )
    const raw = (res as { data?: RawClarifyPerson }).data ?? (res as unknown as RawClarifyPerson)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // Inject id into the data wrapper for PATCH
    const patchBody = {
      data: {
        ...(body.data as Record<string, unknown>),
        id,
      },
    }
    const res = await this.client(credentials).update<{ data: RawClarifyPerson }>(
      'person',
      id,
      patchBody,
    )
    const raw = (res as { data?: RawClarifyPerson }).data ?? (res as unknown as RawClarifyPerson)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('person', id)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.listObjects<RawClarifyCompany>(credentials, 'company', params)
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ data: RawClarifyCompany }>('company', id)
    const raw = (res as { data?: RawClarifyCompany }).data ?? (res as unknown as RawClarifyCompany)
    if (!raw?.id) {
      throw Object.assign(new Error(`Clarify: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const res = await this.client(credentials).create<{ data: RawClarifyCompany }>(
      'company',
      untransformCompany(data),
    )
    const raw = (res as { data?: RawClarifyCompany }).data ?? (res as unknown as RawClarifyCompany)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const patchBody = {
      data: {
        ...(body.data as Record<string, unknown>),
        id,
      },
    }
    const res = await this.client(credentials).update<{ data: RawClarifyCompany }>(
      'company',
      id,
      patchBody,
    )
    const raw = (res as { data?: RawClarifyCompany }).data ?? (res as unknown as RawClarifyCompany)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('company', id)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.listObjects<RawClarifyDeal>(credentials, 'deal', params)
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ data: RawClarifyDeal }>('deal', id)
    const raw = (res as { data?: RawClarifyDeal }).data ?? (res as unknown as RawClarifyDeal)
    if (!raw?.id) {
      throw Object.assign(new Error(`Clarify: deal ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const res = await this.client(credentials).create<{ data: RawClarifyDeal }>(
      'deal',
      untransformDeal(data),
    )
    const raw = (res as { data?: RawClarifyDeal }).data ?? (res as unknown as RawClarifyDeal)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const patchBody = {
      data: {
        ...(body.data as Record<string, unknown>),
        id,
      },
    }
    const res = await this.client(credentials).update<{ data: RawClarifyDeal }>(
      'deal',
      id,
      patchBody,
    )
    const raw = (res as { data?: RawClarifyDeal }).data ?? (res as unknown as RawClarifyDeal)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('deal', id)
  }

  // ── Activities (task) ──────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.listObjects<RawClarifyTask>(credentials, 'task', params)
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<{ data: RawClarifyTask }>('task', id)
    const raw = (res as { data?: RawClarifyTask }).data ?? (res as unknown as RawClarifyTask)
    if (!raw?.id) {
      throw Object.assign(new Error(`Clarify: activity ${id} not found`), { statusCode: 404 })
    }
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const res = await this.client(credentials).create<{ data: RawClarifyTask }>(
      'task',
      untransformActivity(data),
    )
    const raw = (res as { data?: RawClarifyTask }).data ?? (res as unknown as RawClarifyTask)
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const patchBody = {
      data: {
        ...(body.data as Record<string, unknown>),
        id,
      },
    }
    const res = await this.client(credentials).update<{ data: RawClarifyTask }>(
      'task',
      id,
      patchBody,
    )
    const raw = (res as { data?: RawClarifyTask }).data ?? (res as unknown as RawClarifyTask)
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('task', id)
  }
}
