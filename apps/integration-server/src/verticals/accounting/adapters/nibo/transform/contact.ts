import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface NiboContact {
  contactId: number
  name: string
  tradeName: string
  cpfCnpj: string
  stateRegistration: string
  email: string
  phone: string
  cellPhone: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  zipCode: string
  state: string
  country: string
  isCustomer: boolean
  isSupplier: boolean
  isActive: boolean
  [key: string]: unknown
}

export function transformContact(raw: NiboContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.cellPhone) telephones.push({ telephone: raw.cellPhone, type: 'MOBILE' })

  const addressLine = [raw.street, raw.number].filter(Boolean).join(', ')

  return {
    id: String(raw.contactId),
    name: raw.name || raw.tradeName || undefined,
    identification: raw.cpfCnpj || undefined,
    taxNumber: raw.stateRegistration || undefined,
    isCustomer: raw.isCustomer ?? true,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.isActive,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: addressLine || undefined,
      address2: raw.complement,
      city: raw.city,
      postalCode: raw.zipCode,
      region: raw.state,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
