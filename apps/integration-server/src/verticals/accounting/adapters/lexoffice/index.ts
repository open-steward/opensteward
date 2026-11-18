import { toDate } from '../shared/transform'
import { toIsoDateTime } from '../shared/transform'
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { LexofficeClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type LexofficeInvoice } from './transform/invoice'
import { transformContact, type LexofficeContact } from './transform/contact'
import { transformOrganization, type LexofficeOrganization } from './transform/organization'

interface LexofficePage<T> {
  content: T[]
  totalElements: number
  totalPages: number
  size: number
  number: number
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LexofficeAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'lexoffice'
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
    const client = new LexofficeClient(credentials)
    const res = await client.get<LexofficeOrganization>('profile')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new LexofficeClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 250)
    const page = (params.page ?? 1) - 1
    const res = await client.get<LexofficePage<LexofficeInvoice>>('voucherlist', {
      voucherType: 'invoice',
      page,
      size,
    })
    return (res.content ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new LexofficeClient(credentials)
    const res = await client.get<LexofficeInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new LexofficeClient(credentials)
    const body = {
      voucherDate: toIsoDateTime(data.postedAt) ?? new Date().toISOString(),
      address: data.contactId ? { contactId: data.contactId } : undefined,
      lineItems: (data.lineItems ?? []).map((li) => ({
        type: 'custom',
        name: li.itemDescription ?? '',
        quantity: li.unitQuantity ?? 1,
        unitName: 'Stück',
        unitPrice: {
          currency: data.currency ?? 'EUR',
          netAmount: li.unitAmount ?? 0,
          taxRatePercentage: 19,
        },
      })),
      totalPrice: { currency: data.currency ?? 'EUR' },
      taxConditions: { taxType: 'net' },
      paymentConditions: data.dueAt
        ? { paymentTermDuration: Math.ceil((toDate(data.dueAt)!.getTime() - Date.now()) / 86400000) }
        : undefined,
    }
    const res = await client.post<{ id: string }>('invoices?finalize=false', body)
    return this.getInvoice(credentials, res.id)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new LexofficeClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 250)
    const page = (params.page ?? 1) - 1
    const res = await client.get<LexofficePage<LexofficeContact>>('contacts', { page, size })
    return (res.content ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new LexofficeClient(credentials)
    const res = await client.get<LexofficeContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new LexofficeClient(credentials)
    const body: Record<string, unknown> = {
      roles: {
        ...(data.isCustomer !== false ? { customer: {} } : {}),
        ...(data.isSupplier ? { vendor: {} } : {}),
      },
    }
    if (data.companyName) {
      body['company'] = { name: data.companyName }
    } else {
      body['person'] = { firstName: data.firstName, lastName: data.lastName }
    }
    if (data.emails?.length) {
      body['emailAddresses'] = { business: [data.emails[0].email] }
    }
    const res = await client.post<{ id: string }>('contacts', body)
    return this.getContact(credentials, res.id)
  }
}
