import { toCalendarDate } from '../shared/transform'
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { SevDeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type SevDeskInvoice } from './transform/invoice'
import { transformContact, type SevDeskContact } from './transform/contact'
import { transformAccount, type SevDeskAccount } from './transform/account'
import { transformOrganization, type SevDeskOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SevDeskAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sevdesk'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SevDeskClient(credentials)
    const res = await client.get<{ objects: SevDeskOrganization[] }>('SevUser')
    return transformOrganization(res.objects[0])
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SevDeskClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit
    const res = await client.get<{ objects: SevDeskInvoice[] }>('Invoice', {
      limit,
      offset,
      ...(params.updatedAfter && {
        'filter[startDate]': Math.floor(params.updatedAfter.getTime() / 1000),
      }),
    })
    return (res.objects ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SevDeskClient(credentials)
    const res = await client.get<{ objects: SevDeskInvoice[] }>(`Invoice/${id}`)
    return transformInvoice(res.objects[0])
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new SevDeskClient(credentials)
    const body = {
      invoice: {
        invoiceDate: toCalendarDate(data.postedAt),
        currency: data.currency ?? 'EUR',
        invoiceType: 'RE',
        status: '100',
        contact: data.contactId ? { id: data.contactId, objectName: 'Contact' } : undefined,
        objectName: 'Invoice',
        mapAll: true,
      },
      invoicePosSave: (data.lineItems ?? []).map((li) => ({
        quantity: li.unitQuantity,
        price: li.unitAmount,
        name: li.itemDescription,
        unity: { id: '1', objectName: 'Unity' },
        taxRate: '19',
        objectName: 'InvoicePos',
        mapAll: true,
      })),
    }
    const res = await client.post<{ objects: { invoice: SevDeskInvoice } }>('Invoice/Factory/saveInvoice', body)
    return transformInvoice(res.objects.invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SevDeskClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit
    const res = await client.get<{ objects: SevDeskContact[] }>('Contact', {
      depth: 1,
      limit,
      offset,
    })
    return (res.objects ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SevDeskClient(credentials)
    const res = await client.get<{ objects: SevDeskContact[] }>(`Contact/${id}`)
    return transformContact(res.objects[0])
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SevDeskClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit
    const res = await client.get<{ objects: SevDeskAccount[] }>('AccountingType', { limit, offset })
    return (res.objects ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SevDeskClient(credentials)
    const res = await client.get<{ objects: SevDeskAccount[] }>(`AccountingType/${id}`)
    return transformAccount(res.objects[0])
  }
}
