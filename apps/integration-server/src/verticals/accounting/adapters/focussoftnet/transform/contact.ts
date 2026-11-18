import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface FocusSoftnetContact {
  AccCode: string
  AccName: string
  Email: string
  Phone: string
  Address: string
  TaxRegNo: string
  IsCustomer: boolean
  IsSupplier: boolean
  [key: string]: unknown
}

export function transformContact(raw: FocusSoftnetContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })

  return {
    id: String(raw.AccCode),
    name: raw.AccName || undefined,
    taxNumber: raw.TaxRegNo || undefined,
    isCustomer: Boolean(raw.IsCustomer),
    isSupplier: Boolean(raw.IsSupplier),
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.Address }),
    metadata: raw as Record<string, unknown>,
  }
}
