import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ZucchettiAnagrafica {
  id: string
  ragione_sociale: string
  partita_iva: string
  codice_fiscale: string
  email: string
  telefono: string
  indirizzo: string
  citta: string
  cap: string
  provincia: string
  paese: string
  valuta: string
  attivo: boolean
  tipo: string
  [key: string]: unknown
}

export function transformContact(raw: ZucchettiAnagrafica): Contact {
  const emails = toWorkEmail(raw.email)

  return {
    id: String(raw.id),
    name: raw.ragione_sociale || undefined,
    identification: raw.codice_fiscale || undefined,
    taxNumber: raw.partita_iva || undefined,
    isCustomer: raw.tipo === 'cliente' || raw.tipo === 'entrambi',
    isSupplier: raw.tipo === 'fornitore' || raw.tipo === 'entrambi',
    isActive: raw.attivo,
    currency: raw.valuta || undefined,
    emails: nonempty(emails),
    billingAddress: toAddress({
      address1: raw.indirizzo,
      city: raw.citta,
      postalCode: raw.cap,
      region: raw.provincia,
      country: raw.paese,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
