import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface DolibarrThirdParty {
  id: number | string
  name?: string
  email?: string
  phone?: string
  fax?: string
  address?: string
  zip?: string
  town?: string
  state?: string
  country_code?: string
  country?: string
  client?: number | string
  fournisseur?: number | string
  status?: number | string
  tva_intra?: string
  idprof1?: string
  multicurrency_code?: string
  [key: string]: unknown
}

export function transformContact(raw: DolibarrThirdParty): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  // client: 1 = customer, 2 = prospect; fournisseur: 1 = supplier
  const isCustomer = Number(raw.client) >= 1
  const isSupplier = Number(raw.fournisseur) >= 1

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    taxNumber: raw.tva_intra || raw.idprof1 || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.status !== 0,
    currency: raw.multicurrency_code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.town,
      region: raw.state,
      postalCode: raw.zip,
      country: raw.country_code || raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
