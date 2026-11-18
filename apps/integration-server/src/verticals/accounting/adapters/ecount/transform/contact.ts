import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface EcountContact {
  CUST_CODE: string
  CUST_NAME?: string
  CUST_TYPE?: string
  E_MAIL?: string
  TEL?: string
  FAX?: string
  ADDR?: string
  POSTAL_CODE?: string
  COUNTRY?: string
  USE_YN?: string
  BIZNO?: string
  CRNC_CODE?: string
  [key: string]: unknown
}

export function transformContact(raw: EcountContact): Contact {
  const emails = toWorkEmail(raw.E_MAIL)
  const telephones: Telephone[] = []
  if (raw.TEL) telephones.push({ telephone: raw.TEL, type: 'WORK' })
  if (raw.FAX) telephones.push({ telephone: raw.FAX, type: 'FAX' })

  // CUST_TYPE: '01' = customer, '02' = supplier, '03' = both
  const isCustomer = raw.CUST_TYPE === '01' || raw.CUST_TYPE === '03'
  const isSupplier = raw.CUST_TYPE === '02' || raw.CUST_TYPE === '03'

  return {
    id: raw.CUST_CODE,
    name: raw.CUST_NAME || undefined,
    identification: raw.BIZNO || undefined,
    taxNumber: raw.BIZNO || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.USE_YN === 'Y',
    currency: raw.CRNC_CODE || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.ADDR,
      postalCode: raw.POSTAL_CODE,
      country: raw.COUNTRY,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
