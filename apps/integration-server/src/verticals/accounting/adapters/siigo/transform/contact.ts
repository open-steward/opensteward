import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface SiigoContact {
  id: number
  name: string
  identification: string
  commercialName: string
  branchOffice: string
  active: boolean
  contactType: string
  email: string
  phone: string
  cellPhone: string
  address: string
  city: string
  state: string
  postalCode: string
  country: string
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: SiigoContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.cellPhone) telephones.push({ telephone: raw.cellPhone, type: 'MOBILE' })

  const isCustomer = (raw.contactType || '').toLowerCase() !== 'supplier'
  const isSupplier = (raw.contactType || '').toLowerCase() === 'supplier'

  return {
    id: String(raw.id),
    name: raw.commercialName || raw.name || undefined,
    identification: raw.identification || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.active ?? true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postalCode,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
