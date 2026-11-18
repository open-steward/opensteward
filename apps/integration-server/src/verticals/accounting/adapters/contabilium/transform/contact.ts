import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ContabiliumContact {
  id: number
  razonSocial: string
  cuit: string
  email: string
  telefono: string
  direccion: string
  localidad: string
  provincia: string
  codigoPostal: string
  pais: string
  activo: boolean
  esCliente: boolean
  esProveedor: boolean
  moneda: string
  [key: string]: unknown
}

export function transformContact(raw: ContabiliumContact): Contact {
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
    emails: nonempty(toWorkEmail(raw.email)),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.direccion,
      city: raw.localidad,
      region: raw.provincia,
      postalCode: raw.codigoPostal,
      country: raw.pais,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
