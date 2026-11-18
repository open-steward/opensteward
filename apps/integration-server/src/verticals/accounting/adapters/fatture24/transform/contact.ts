import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface Fatture24Anagrafica {
  id: string
  RagioneSociale: string
  PartitaIva: string
  CodiceFiscale: string
  Email: string
  Telefono: string
  Indirizzo: string
  Citta: string
  Cap: string
  Provincia: string
  Paese: string
  Valuta: string
  Attivo: boolean
  Tipo: string
  [key: string]: unknown
}

export function transformContact(raw: Fatture24Anagrafica): Contact {
  const emails = toWorkEmail(raw.Email)

  return {
    id: String(raw.id),
    name: raw.RagioneSociale || undefined,
    identification: raw.CodiceFiscale || undefined,
    taxNumber: raw.PartitaIva || undefined,
    isCustomer: raw.Tipo === 'cliente' || raw.Tipo === 'entrambi',
    isSupplier: raw.Tipo === 'fornitore' || raw.Tipo === 'entrambi',
    isActive: raw.Attivo,
    currency: raw.Valuta || undefined,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.Indirizzo,
      city: raw.Citta,
      postalCode: raw.Cap,
      region: raw.Provincia,
      country: raw.Paese,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
