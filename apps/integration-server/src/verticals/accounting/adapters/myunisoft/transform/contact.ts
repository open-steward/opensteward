import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import type { Telephone } from '../../../schema/shared'

export interface MyunisoftContact {
  id: string
  nom: string
  siret: string
  numero_tva: string
  email: string
  telephone: string
  adresse: string
  code_postal: string
  ville: string
  pays: string
  est_client: boolean
  est_fournisseur: boolean
  actif: boolean
  devise: string
  [key: string]: unknown
}

export function transformContact(raw: MyunisoftContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telephone) telephones.push({ telephone: raw.telephone, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.nom || undefined,
    identification: raw.siret || undefined,
    taxNumber: raw.numero_tva || undefined,
    isCustomer: raw.est_client ?? false,
    isSupplier: raw.est_fournisseur ?? false,
    isActive: raw.actif,
    currency: raw.devise || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.adresse,
      city: raw.ville,
      postalCode: raw.code_postal,
      country: raw.pays,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
