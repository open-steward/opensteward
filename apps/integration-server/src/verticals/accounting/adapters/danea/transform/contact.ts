/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface DaneaCliente {
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

export function transformContact(raw: DaneaCliente): Contact {
  const emails = toWorkEmail(raw.Email)

  return {
    id: String(raw.id),
    name: raw.RagioneSociale || undefined,
    identification: raw.CodiceFiscale || undefined,
    taxNumber: raw.PartitaIva || undefined,
    isCustomer: raw.Tipo === 'Cliente' || raw.Tipo === 'Entrambi',
    isSupplier: raw.Tipo === 'Fornitore' || raw.Tipo === 'Entrambi',
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
