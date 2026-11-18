import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface IntacctContact {
  RECORDNO: string
  CONTACTNAME: string
  FIRSTNAME: string
  LASTNAME: string
  EMAIL1: string
  PHONE1: string
  COMPANYNAME: string
  MAILADDRESS?: {
    ADDRESS1: string
    CITY: string
    STATE: string
    ZIP: string
    COUNTRY: string
  }
  [key: string]: unknown
}

export function transformContact(raw: IntacctContact): Contact {
  const emails = toWorkEmail(raw.EMAIL1)
  const phones = raw.PHONE1 ? [{ telephone: raw.PHONE1, type: 'WORK' as const }] : []

  const nameParts = [raw.FIRSTNAME, raw.LASTNAME].filter(Boolean)
  const name = nameParts.length ? nameParts.join(' ') : raw.CONTACTNAME || undefined

  return {
    id: raw.RECORDNO,
    name,
    firstName: raw.FIRSTNAME || undefined,
    lastName: raw.LASTNAME || undefined,
    companyName: raw.COMPANYNAME || undefined,
    emails: nonempty(emails),
    telephones: nonempty(phones),
    billingAddress: raw.MAILADDRESS
      ? toAddress({
          address1: raw.MAILADDRESS.ADDRESS1,
          city: raw.MAILADDRESS.CITY,
          region: raw.MAILADDRESS.STATE,
          postalCode: raw.MAILADDRESS.ZIP,
          country: raw.MAILADDRESS.COUNTRY,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
