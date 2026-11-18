/**
 * SalesNexus adapter for the CRM vertical.
 *
 * Maps the SalesNexus REST API v1 to canonical CRM resources.
 * Docs: https://logon.salesnexus.com/api/docs/api-v1
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key (permanent token) passed as `login-token` in each JSON request body.
 *   credentials.accessToken = permanent API key or session token
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (10 methods across 3 resources):
 *   Contacts: list, get, create, update, delete
 *   Deals (sales opportunities): list, get, create, update
 *   Activities: list, get, create, update
 *   Notes: list (per contact), create
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: company  — SalesNexus has no standalone company/organisation
 *              resource or endpoint; company name is a field on the contact
 *              record (field 47).
 * Unavailable: pipeline — SalesNexus has no pipeline or stage management API;
 *              deal stage is a single numeric field on the sales opportunity
 *              (field 234) with no dedicated list/get endpoint.
 */

import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SalesnexusClient } from './client'
import { DEFAULT_PAGE_SIZE, SALES_FIELDS } from './constants'
import {
  transformContact,
  untransformContact,
  type RawSalesnexusContact,
} from './transform/contact'
import {
  transformDeal,
  untransformDeal,
  type RawSalesnexusDeal,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawSalesnexusActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawSalesnexusNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'SalesNexus API key',
  placeholder: 'sn_live_...',
  helpText: 'Find your permanent API key in SalesNexus Settings → API.',
})

export class SalesnexusAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'salesnexus'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // SalesNexus uses an API key, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not an OAuth2 flow — caller passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Permanent API keys do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SalesnexusClient {
    return new SalesnexusClient(credentials)
  }

  /**
   * One caller page of a start-after / page-size list (get-contacts, get-sales,
   * get-activities). Docs: "The start-after is the position that the resulting
   * list should start at, and the page-size parameter is the size of the
   * result list." No total or has-more flag is documented, so only a short
   * page reports the end; a full page leaves hasMore to the router.
   */
  private async listOffset<T>(
    credentials: Credentials,
    params: QueryParams,
    fn: string,
  ): Promise<T[]> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const raw = await this.client(credentials).call<T[]>(fn, {
      'start-after': String(pageOffset(params, size)),
      'page-size': String(size),
      'filter-value': params['filter'] ?? '',
    })
    const rows = raw ?? []
    if (rows.length < size) reportUpstreamPage(params, { hasMore: false })
    return rows
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const raw = await this.listOffset<RawSalesnexusContact>(credentials, params, 'get-contacts')
    return raw.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).call<RawSalesnexusContact>(
      'get-contact-info',
      { 'contact-id': id },
    )
    if (!raw) {
      throw Object.assign(new Error(`SalesNexus: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const fieldData = untransformContact(data)
    const result = await this.client(credentials).call<{ 'contact-id': string }>(
      'create-contact',
      { 'contact-field-data': fieldData },
    )
    if (!result?.['contact-id']) {
      throw new Error('SalesNexus: create-contact returned no contact-id')
    }
    // Fetch the newly created contact to return a full record.
    return this.getContact(credentials, String(result['contact-id']))
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const fieldData = untransformContact(data)
    await this.client(credentials).call<unknown>(
      'update-contact',
      {
        'match-by-field-data': { '1': id }, // field 1 = internal contact ID
        'contact-field-data': fieldData,
        'create-if-not-updated': 'false',
      },
    )
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).call<unknown>(
      'delete-contacts',
      { 'contact-ids-to-delete': [id] },
    )
  }

  // ── Deals (Sales Opportunities) ───────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const raw = await this.listOffset<RawSalesnexusDeal>(credentials, params, 'get-sales')
    return raw.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    // SalesNexus has no get-sales-by-id equivalent. Use get-sales-using-field-data
    // to match on the sales record's own ID field (SALES_ID), which is more targeted
    // than the free-text filter-value parameter on get-sales.
    const raw = await this.client(credentials).call<RawSalesnexusDeal[]>(
      'get-sales-using-field-data',
      {
        'start-after': '0',
        'page-size': '10',
        'match-by-field-data': { [SALES_FIELDS.SALES_ID]: id },
      },
    )
    const deal = Array.isArray(raw)
      ? raw.find(d => String(d['sales-id']) === String(id))
      : undefined
    if (!deal) {
      throw Object.assign(new Error(`SalesNexus: deal ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(deal)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const fieldData = untransformDeal(data)
    const result = await this.client(credentials).call<{ 'sales-id': string }>(
      'create-sales-opp',
      { 'sales-field-data': fieldData },
    )
    if (!result?.['sales-id']) {
      throw new Error('SalesNexus: create-sales-opp returned no sales-id')
    }
    return this.getDeal(credentials, String(result['sales-id']))
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const fieldData = untransformDeal(data)
    await this.client(credentials).call<unknown>(
      'update-sales',
      {
        // SALES_FIELDS.SALES_ID (field 218) is the deal record's own identifier.
        // Field '1' is the contact entity's ID and must not be used here.
        'match-by-field-data': { [SALES_FIELDS.SALES_ID]: id },
        'sales-field-data': fieldData,
      },
    )
    return this.getDeal(credentials, id)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const raw = await this.listOffset<RawSalesnexusActivity>(
      credentials,
      params,
      'get-activities',
    )
    return raw.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).call<RawSalesnexusActivity>(
      'get-activity-info',
      { 'activity-id': id },
    )
    if (!raw) {
      throw Object.assign(new Error(`SalesNexus: activity ${id} not found`), { statusCode: 404 })
    }
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const params = untransformActivity(data)
    const result = await this.client(credentials).call<{ 'activity-id': string }>(
      'create-activity',
      params,
    )
    if (!result?.['activity-id']) {
      throw new Error('SalesNexus: create-activity returned no activity-id')
    }
    return this.getActivity(credentials, String(result['activity-id']))
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const params = untransformActivity(data)
    await this.client(credentials).call<unknown>(
      'update-activity',
      { 'activity-id': id, ...params },
    )
    return this.getActivity(credentials, id)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const contactId = params['contact_id'] ?? params['contactId']
    if (!contactId) {
      // SalesNexus only supports fetching notes per-contact.
      return []
    }
    const raw = await this.client(credentials).call<RawSalesnexusNote[]>(
      'get-notes-for-contact',
      { 'contact-id': String(contactId) },
    )
    return (raw ?? []).map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const noteParams = untransformNote(data)
    const result = await this.client(credentials).call<{ 'note-id': string }>(
      'create-note',
      noteParams,
    )
    if (!result?.['note-id']) {
      throw new Error('SalesNexus: create-note returned no note-id')
    }
    // Return a minimal Note since SalesNexus has no get-note-by-id.
    return transformNote({
      'note-id': String(result['note-id']),
      details: data.content,
      'contact-id': data.contact_id,
      'user-id': data.owner_id,
    })
  }
}
