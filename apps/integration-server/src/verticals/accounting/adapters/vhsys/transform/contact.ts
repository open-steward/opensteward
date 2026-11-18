/**
 * vhsys contact transform.
 *
 * vhsys has separate endpoints for customers (clientes) and suppliers
 * (fornecedores). Both share the same Portuguese snake_case field naming
 * convention.
 *
 * Endpoints:
 *   GET /clientes          — list customers
 *   GET /clientes/{id}     — get customer
 *   GET /fornecedores      — list suppliers
 *   GET /fornecedores/{id} — get supplier
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysCliente {
  id_cliente: string | number
  razao_cliente: string
  fantasia_cliente?: string
  tipo_pessoa?: string      // 'F' = physical (individual), 'J' = legal (company)
  cnpj_cliente?: string    // CNPJ for legal entities
  cpf_cliente?: string     // CPF for individuals
  email_cliente?: string
  fone_cliente?: string
  celular_cliente?: string
  endereco_cliente?: string
  numero_cliente?: string
  complemento_cliente?: string
  bairro_cliente?: string
  cep_cliente?: string
  cidade_cliente?: string
  uf_cliente?: string       // Brazilian state code, e.g. 'SP'
  pais_cliente?: string
  situacao_cliente?: string // 'A' = active, 'I' = inactive
  inscricao_estadual?: string
  data_cad_cliente?: string
  [key: string]: unknown
}

export interface VhsysFornecedor {
  id_fornecedor: string | number
  razao_fornecedor: string
  fantasia_fornecedor?: string
  tipo_pessoa?: string
  cnpj_fornecedor?: string
  cpf_fornecedor?: string
  email_fornecedor?: string
  fone_fornecedor?: string
  celular_fornecedor?: string
  endereco_fornecedor?: string
  numero_fornecedor?: string
  complemento_fornecedor?: string
  bairro_fornecedor?: string
  cep_fornecedor?: string
  cidade_fornecedor?: string
  uf_fornecedor?: string
  pais_fornecedor?: string
  situacao_fornecedor?: string
  inscricao_estadual?: string
  data_cad_fornecedor?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildClienteAddress(raw: VhsysCliente) {
  const parts = [raw.endereco_cliente, raw.numero_cliente, raw.complemento_cliente].filter(Boolean)
  return toAddress({
    address1: parts.join(', ') || undefined,
    address2: raw.bairro_cliente || undefined,
    city: raw.cidade_cliente || undefined,
    postalCode: raw.cep_cliente || undefined,
    region: raw.uf_cliente || undefined,
    country: raw.uf_cliente || raw.pais_cliente ? 'BR' : undefined,
  })
}

function buildFornecedorAddress(raw: VhsysFornecedor) {
  const parts = [raw.endereco_fornecedor, raw.numero_fornecedor, raw.complemento_fornecedor].filter(Boolean)
  return toAddress({
    address1: parts.join(', ') || undefined,
    address2: raw.bairro_fornecedor || undefined,
    city: raw.cidade_fornecedor || undefined,
    postalCode: raw.cep_fornecedor || undefined,
    region: raw.uf_fornecedor || undefined,
    country: raw.uf_fornecedor || raw.pais_fornecedor ? 'BR' : undefined,
  })
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformCliente(raw: VhsysCliente): Contact {
  const emails = toWorkEmail(raw.email_cliente)
  const telephones: Telephone[] = []
  if (raw.fone_cliente) telephones.push({ telephone: raw.fone_cliente, type: 'WORK' })
  if (raw.celular_cliente) telephones.push({ telephone: raw.celular_cliente, type: 'MOBILE' })

  const isLegal = raw.tipo_pessoa === 'J'
  const taxId = isLegal ? raw.cnpj_cliente : raw.cpf_cliente
  const isActive = raw.situacao_cliente !== 'I'
  const createdIso = toIsoDatetime(raw.data_cad_cliente)

  return {
    id: String(raw.id_cliente),
    name: raw.razao_cliente || undefined,
    companyName: isLegal ? (raw.fantasia_cliente || raw.razao_cliente || undefined) : undefined,
    identification: taxId || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: buildClienteAddress(raw),
    createdAt: createdIso ? new Date(createdIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformFornecedor(raw: VhsysFornecedor): Contact {
  const emails = toWorkEmail(raw.email_fornecedor)
  const telephones: Telephone[] = []
  if (raw.fone_fornecedor) telephones.push({ telephone: raw.fone_fornecedor, type: 'WORK' })
  if (raw.celular_fornecedor) telephones.push({ telephone: raw.celular_fornecedor, type: 'MOBILE' })

  const isLegal = raw.tipo_pessoa === 'J'
  const taxId = isLegal ? raw.cnpj_fornecedor : raw.cpf_fornecedor
  const isActive = raw.situacao_fornecedor !== 'I'
  const createdIso = toIsoDatetime(raw.data_cad_fornecedor)

  return {
    id: `supp_${raw.id_fornecedor}`,
    name: raw.razao_fornecedor || undefined,
    companyName: isLegal ? (raw.fantasia_fornecedor || raw.razao_fornecedor || undefined) : undefined,
    identification: taxId || undefined,
    taxNumber: raw.inscricao_estadual || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: buildFornecedorAddress(raw),
    createdAt: createdIso ? new Date(createdIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
