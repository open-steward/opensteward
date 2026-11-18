import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface NuvemFiscalCliente {
  id_cliente: number
  razao_social: string
  nome_fantasia: string
  cnpj: string
  cpf: string
  email: string
  telefone: string
  fax: string
  endereco: string
  cidade: string
  cep: string
  estado: string
  pais: string
  moeda: string
  ativo: boolean
  [key: string]: unknown
}

export interface NuvemFiscalFornecedor {
  id_fornecedor: number
  razao_social: string
  nome_fantasia: string
  cnpj: string
  cpf: string
  email: string
  telefone: string
  endereco: string
  cidade: string
  cep: string
  estado: string
  pais: string
  moeda: string
  ativo: boolean
  [key: string]: unknown
}

export function transformCustomer(raw: NuvemFiscalCliente): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefone) telephones.push({ telephone: raw.telefone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  return {
    id: `cust_${raw.id_cliente}`,
    name: raw.nome_fantasia || raw.razao_social || undefined,
    identification: raw.cnpj || raw.cpf || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.ativo,
    currency: raw.moeda || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.endereco,
      city: raw.cidade,
      postalCode: raw.cep,
      region: raw.estado,
      country: raw.pais,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: NuvemFiscalFornecedor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefone) telephones.push({ telephone: raw.telefone, type: 'WORK' })

  return {
    id: `supp_${raw.id_fornecedor}`,
    name: raw.nome_fantasia || raw.razao_social || undefined,
    identification: raw.cnpj || raw.cpf || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.ativo,
    currency: raw.moeda || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.endereco,
      city: raw.cidade,
      postalCode: raw.cep,
      region: raw.estado,
      country: raw.pais,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
