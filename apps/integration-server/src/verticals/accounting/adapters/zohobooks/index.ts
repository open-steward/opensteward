import { toCalendarDate } from '../shared/transform'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import { ZOHO_DATA_CENTRES, ZOHO_DEFAULT_DATA_CENTRE } from './constants'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { ZohoBooksClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type ZohoBooksInvoice } from './transform/invoice'
import { transformContact, type ZohoBooksContact } from './transform/contact'
import { transformAccount, type ZohoBooksAccount } from './transform/account'
import { transformOrganization, type ZohoBooksOrganization } from './transform/organization'

interface ZohoBooksAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  organizationId?: string
  /**
   * Deployment-wide fallback data centre. The admin UI cannot set it, so a
   * Connect Link customer picks theirs (`oauthFields`), which is then read
   * back from `credentials.extra.dataCentre`.
   */
  dataCentre?: string
}

export class ZohoBooksAdapter implements AccountingAdapter {
  readonly platform = 'zohobooks'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private organizationId?: string
  private dataCentre?: string

  constructor(config: ZohoBooksAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.organizationId = config.organizationId
    this.dataCentre = config.dataCentre
  }

  /** The customer's data centre hosts the accounts server and the API. */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'dataCentre',
        label: 'Zoho data centre',
        type: 'select',
        required: true,
        helpText: 'The Zoho domain you sign in at, e.g. books.zoho.eu means Europe.',
        options: Object.entries(ZOHO_DATA_CENTRES).map(([value, dc]) => ({ value, label: dc.label })),
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['dataCentre'] ?? this.dataCentre,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.dataCentre)
  }

  /** Exchange on the customer's accounts server; records data centre and organization. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      inputs['dataCentre'] ?? this.dataCentre,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const dataCentre = this.storedDataCentre(credentials)
    const creds = await refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret, dataCentre)
    creds.tenantId = credentials.tenantId
    creds.extra = { ...(credentials.extra ?? {}), dataCentre }
    return creds
  }

  /** Data centre recorded at connect time; older connections predate it and all used the US pair. */
  private storedDataCentre(credentials: Credentials): string {
    const stored = credentials.extra?.['dataCentre']
    return typeof stored === 'string' && stored.trim()
      ? stored
      : (this.dataCentre ?? ZOHO_DEFAULT_DATA_CENTRE)
  }

  private client(credentials: Credentials): ZohoBooksClient {
    return new ZohoBooksClient(credentials, this.organizationId, this.dataCentre)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<{ organizations: ZohoBooksOrganization[] }>('organizations')
    return transformOrganization(res.organizations[0])
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const res = await client.get<{ invoices: ZohoBooksInvoice[] }>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200),
      ...(params.updatedAfter && { last_modified_time: params.updatedAfter.toISOString() }),
    })
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<{ invoice: ZohoBooksInvoice }>(`invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.post<{ invoice: ZohoBooksInvoice }>('invoices', {
      customer_id: data.contactId,
      currency_code: data.currency,
      date: toCalendarDate(data.postedAt),
      due_date: toCalendarDate(data.dueAt),
      line_items: data.lineItems?.map((li) => ({
        item_id: li.itemId,
        description: li.itemDescription,
        rate: li.unitAmount,
        quantity: li.unitQuantity,
        account_id: li.accountId,
      })),
    })
    return transformInvoice(res.invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const res = await client.get<{ contacts: ZohoBooksContact[] }>('contacts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200),
    })
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<{ contact: ZohoBooksContact }>(`contacts/${id}`)
    return transformContact(res.contact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.post<{ contact: ZohoBooksContact }>('contacts', {
      contact_name: data.name,
      company_name: data.companyName,
      contact_type: data.isSupplier ? 'vendor' : 'customer',
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      currency_code: data.currency,
      billing_address: data.billingAddress
        ? {
            address: data.billingAddress.address1,
            city: data.billingAddress.city,
            zip: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformContact(res.contact)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const res = await client.get<{ chartofaccounts: ZohoBooksAccount[] }>('chartofaccounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200),
    })
    return (res.chartofaccounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<{ account: ZohoBooksAccount }>(`chartofaccounts/${id}`)
    return transformAccount(res.account)
  }
}
