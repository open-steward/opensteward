import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ContaAzulContact {
  id: string
  name: string
  company_name: string
  cnpj: string
  cpf: string
  email: string
  phone: string
  mobile_phone: string
  active: boolean
  person_type: string
  address: string
  complement: string
  city: string
  state: string
  postal_code: string
  country: string
  [key: string]: unknown
}

export function transformContact(raw: ContaAzulContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile_phone) telephones.push({ telephone: raw.mobile_phone, type: 'MOBILE' })

  const identification = raw.cnpj || raw.cpf || undefined

  return {
    id: String(raw.id),
    name: raw.company_name || raw.name || undefined,
    companyName: raw.company_name || undefined,
    identification,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      address2: raw.complement,
      city: raw.city,
      region: raw.state,
      postalCode: raw.postal_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
