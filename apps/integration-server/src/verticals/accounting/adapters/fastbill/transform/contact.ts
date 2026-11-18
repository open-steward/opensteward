import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface FastbillContact {
  CUSTOMER_ID: string
  ORGANIZATION: string
  FIRST_NAME: string
  LAST_NAME: string
  EMAIL: string
  PHONE: string
  STREET: string
  ZIPCODE: string
  CITY: string
  COUNTRY_CODE: string
  VAT_ID: string
  CUSTOMER_TYPE: string
  [key: string]: unknown
}

export function transformContact(raw: FastbillContact): Contact {
  const emails = toWorkEmail(raw.EMAIL)
  const telephones: Telephone[] = []
  if (raw.PHONE) telephones.push({ telephone: raw.PHONE, type: 'WORK' })

  const name = raw.ORGANIZATION || [raw.FIRST_NAME, raw.LAST_NAME].filter(Boolean).join(' ') || undefined

  return {
    id: String(raw.CUSTOMER_ID),
    name,
    identification: raw.VAT_ID || undefined,
    isCustomer: raw.CUSTOMER_TYPE === 'business' || raw.CUSTOMER_TYPE === 'consumer',
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.STREET,
      city: raw.CITY,
      postalCode: raw.ZIPCODE,
      country: raw.COUNTRY_CODE,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export type FastBillContact = FastbillContact
