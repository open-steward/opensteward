import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface OmieContact {
  codigo_cliente: number
  razao_social: string
  nome_fantasia: string
  cnpj_cpf: string
  inscricao_estadual: string
  email: string
  telefone1_numero: string
  telefone1_ddd: string
  telefone2_numero: string
  telefone2_ddd: string
  endereco: string
  endereco_numero: string
  complemento: string
  bairro: string
  cidade: string
  cep: string
  estado: string
  codigo_pais: string
  inativo: string
  [key: string]: unknown
}

export function transformContact(raw: OmieContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefone1_numero) {
    const phone = raw.telefone1_ddd
      ? `(${raw.telefone1_ddd}) ${raw.telefone1_numero}`
      : raw.telefone1_numero
    telephones.push({ telephone: phone, type: 'WORK' })
  }
  if (raw.telefone2_numero) {
    const phone = raw.telefone2_ddd
      ? `(${raw.telefone2_ddd}) ${raw.telefone2_numero}`
      : raw.telefone2_numero
    telephones.push({ telephone: phone, type: 'WORK' })
  }

  const addressLine = [raw.endereco, raw.endereco_numero].filter(Boolean).join(', ')

  return {
    id: String(raw.codigo_cliente),
    name: raw.razao_social || raw.nome_fantasia || undefined,
    identification: raw.cnpj_cpf || undefined,
    taxNumber: raw.inscricao_estadual || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.inativo !== 'S',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: addressLine || undefined,
      address2: raw.complemento,
      city: raw.cidade,
      postalCode: raw.cep,
      region: raw.estado,
      country: raw.codigo_pais,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
