import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

/**
 * Bling v3 contact shape returned by GET /contatos and GET /contatos/:id
 * Situacao: 'A' = active, 'I' = inactive, 'E' = excluded.
 * tipo: 'F' = physical person, 'J' = legal entity, 'E' = foreign.
 * The tiposContato array flags whether the contact is a customer/supplier/etc.
 */
export interface BlingContato {
  id: number
  nome: string
  codigo?: string
  situacao?: string       // 'A' | 'I' | 'E'
  numeroDocumento?: string // CPF or CNPJ
  telefone?: string
  celular?: string
  fantasia?: string       // trade name
  tipo?: string           // 'F' | 'J' | 'E'
  email?: string
  endereco?: {
    geral?: BlingEnderecoGeral
    cobranca?: BlingEnderecoGeral
  }
  pais?: {
    nome?: string
  }
  tiposContato?: Array<{ id: number; descricao: string }>
  [key: string]: unknown
}

type BlingEnderecoGeral = {
  endereco?: string
  cep?: string
  bairro?: string
  municipio?: string
  uf?: string
  numero?: string
  complemento?: string
}

function mapEndereco(end?: BlingEnderecoGeral): Address | undefined {
  if (!end) return undefined
  const street = [end.endereco, end.numero].filter(Boolean).join(', ') || undefined
  return {
    address1: street,
    address2: end.complemento || undefined,
    city: end.municipio || undefined,
    region: end.uf || undefined,
    postalCode: end.cep || undefined,
    // country is only a state code (UF) in Bling domestic; pais.nome for foreign
    country: undefined,
  }
}

function isCustomer(raw: BlingContato): boolean {
  if (!raw.tiposContato?.length) return true // default assumption
  return raw.tiposContato.some(
    (t) => /cliente/i.test(t.descricao) || /customer/i.test(t.descricao),
  )
}

function isSupplier(raw: BlingContato): boolean {
  if (!raw.tiposContato?.length) return false
  return raw.tiposContato.some(
    (t) => /fornecedor/i.test(t.descricao) || /supplier/i.test(t.descricao),
  )
}

export function transformContact(raw: BlingContato): Contact {
  const emails: Email[] = raw.email
    ? [{ email: raw.email, type: 'WORK' }]
    : []
  const telephones: Telephone[] = []
  if (raw.telefone) telephones.push({ telephone: raw.telefone, type: 'WORK' })
  if (raw.celular) telephones.push({ telephone: raw.celular, type: 'MOBILE' })

  return {
    id: String(raw.id),
    name: raw.fantasia || raw.nome || undefined,
    companyName: raw.tipo === 'J' ? (raw.fantasia || raw.nome || undefined) : undefined,
    taxNumber: raw.numeroDocumento || undefined,
    isCustomer: isCustomer(raw),
    isSupplier: isSupplier(raw),
    isActive: raw.situacao === 'A' || raw.situacao === undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapEndereco(raw.endereco?.cobranca ?? raw.endereco?.geral),
    shippingAddress: mapEndereco(raw.endereco?.geral),
    metadata: raw as Record<string, unknown>,
  }
}
