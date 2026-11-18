import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ColppyCustomer {
  idCliente: number
  razonSocial: string
  cuit: string
  email: string
  telefono: string
  fax: string
  direccion: string
  ciudad: string
  codigoPostal: string
  provincia: string
  pais: string
  moneda: string
  activo: boolean
  [key: string]: unknown
}

export interface ColppySupplier {
  idProveedor: number
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
  activo: boolean
  [key: string]: unknown
}

export function transformCustomer(raw: ColppyCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefono) telephones.push({ telephone: raw.telefono, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  return {
    id: `cust_${raw.idCliente}`,
    name: raw.razonSocial || undefined,
    identification: raw.cuit || undefined,
    isCustomer: true,
    isSupplier: false,
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

export function transformSupplier(raw: ColppySupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefono) telephones.push({ telephone: raw.telefono, type: 'WORK' })

  return {
    id: `supp_${raw.idProveedor}`,
    name: raw.razonSocial || undefined,
    identification: raw.cuit || undefined,
    isCustomer: false,
    isSupplier: true,
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
