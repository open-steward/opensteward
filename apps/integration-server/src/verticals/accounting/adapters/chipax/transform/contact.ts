import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ChipaxContact {
  id: number
  nombre: string
  rut: string
  email: string
  telefono: string
  direccion: string
  ciudad: string
  comuna: string
  pais: string
  activo: boolean
  esCliente: boolean
  esProveedor: boolean
  moneda: string
  [key: string]: unknown
}

export function transformContact(raw: ChipaxContact): Contact {
  const telephones: Telephone[] = []
  if (raw.telefono) telephones.push({ telephone: raw.telefono, type: 'WORK' })

  return {
    id: String(raw.id),
    name: raw.nombre || undefined,
    identification: raw.rut || undefined,
    isCustomer: raw.esCliente ?? true,
    isSupplier: raw.esProveedor ?? false,
    isActive: raw.activo,
    currency: raw.moneda || undefined,
    emails: nonempty(toWorkEmail(raw.email)),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.direccion,
      city: raw.ciudad,
      region: raw.comuna,
      country: raw.pais,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
