import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface ContasimpleContact {
  id: string
  nombre: string
  nif: string
  email: string
  telefono: string
  direccion: string
  ciudad: string
  codigo_postal: string
  pais: string
  provincia: string
  es_cliente: boolean
  es_proveedor: boolean
  activo: boolean
  moneda: string
  [key: string]: unknown
}

export function transformContact(raw: ContasimpleContact): Contact {
  const emails = toWorkEmail(raw.email)
  const phone = toPhone(raw.telefono)
  const telephones = phone ? [phone] : []

  return {
    id: raw.id,
    name: raw.nombre || undefined,
    identification: raw.nif || undefined,
    isCustomer: raw.es_cliente,
    isSupplier: raw.es_proveedor,
    isActive: raw.activo,
    currency: raw.moneda || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.direccion,
      city: raw.ciudad,
      postalCode: raw.codigo_postal,
      country: raw.pais,
      region: raw.provincia,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
