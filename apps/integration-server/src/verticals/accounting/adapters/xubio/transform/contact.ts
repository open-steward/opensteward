import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface XubioContact {
  id: number
  razonSocial: string
  cuit: string
  email: string
  telefono: string
  direccion: string
  ciudad: string
  codigoPostal: string
  provincia: string
  pais: string
  moneda: string
  esCliente: boolean
  esProveedor: boolean
  activo: boolean
  [key: string]: unknown
}

export function transformContact(raw: XubioContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefono) telephones.push({ telephone: raw.telefono, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.razonSocial || undefined,
    identification: raw.cuit || undefined,
    isCustomer: raw.esCliente ?? true,
    isSupplier: raw.esProveedor ?? false,
    isActive: raw.activo,
    currency: raw.moneda || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.direccion,
      city: raw.ciudad,
      postalCode: raw.codigoPostal,
      region: raw.provincia,
      country: raw.pais,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
