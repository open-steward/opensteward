import type { Contact } from '../../../schema/contact'
import type { Email, Telephone } from '../../../schema/shared'

export interface SevDeskContact {
  id: string
  name: string
  surename: string
  familyname: string
  titel: string
  category: { id: string; objectName: string } | null
  description: string
  akademikerTitel: string
  gender: string
  sageImportError: boolean
  customerNumber: string
  vatNumber: string
  taxType: string
  defaultCashbackTime: string | null
  defaultCashbackPercent: string | null
  defaultTimeToPay: string | null
  taxSet: { id: string } | null
  birthday: string | null
  [key: string]: unknown
}

export interface SevDeskContactAddress {
  id: string
  contact: { id: string }
  street: string
  zip: string
  city: string
  country: { id: string; code: string }
  category: { id: string }
}

export function transformContact(raw: SevDeskContact): Contact {
  const emails: Email[] = []
  const telephones: Telephone[] = []

  // sevDesk contacts may have nested communication ways, but the basic endpoint
  // only returns the contact object. We map what's available.

  return {
    id: raw.id,
    name: raw.name || undefined,
    firstName: raw.surename || undefined,
    lastName: raw.familyname || undefined,
    identification: raw.customerNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
