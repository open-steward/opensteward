import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface BusyContact {
  AccCode: string
  AccName: string
  Email: string
  Mobile: string
  Address: string
  GSTNo: string
  IsCustomer: boolean
  IsSupplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: BusyContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Mobile) telephones.push({ telephone: raw.Mobile, type: 'MOBILE' })

  return {
    id: String(raw.AccCode),
    name: raw.AccName || undefined,
    taxNumber: raw.GSTNo || undefined,
    isCustomer: Boolean(raw.IsCustomer),
    isSupplier: Boolean(raw.IsSupplier),
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.Address }),
    metadata: raw as Record<string, unknown>,
  }
}
