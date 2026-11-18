/**
 * Tiny ERP v3 — Contato (contact) transforms.
 *
 * In Tiny v3, contacts are unified (customers + suppliers share the same resource).
 * `tipoPessoa` values: 'J' = Jurídica (company), 'F' = Física (individual),
 *                      'E' = Estrangeiro, 'X' = Estrangeiro no Brasil.
 * `situacao` values: 'B' = Active, 'A' = Active with system access,
 *                    'I' = Inactive, 'E' = Deleted.
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Tiny raw types ─────────────────────────────────────────────────────────────

export interface TinyEnderecoContato {
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  municipio?: string | null
  cep?: string | null
  uf?: string | null
  pais?: string | null
  [key: string]: unknown
}

export interface TinyContato {
  id?: number
  nome?: string | null
  codigo?: string | null
  fantasia?: string | null
  tipoPessoa?: string | null  // 'J' | 'F' | 'E' | 'X'
  cpfCnpj?: string | null
  inscricaoEstadual?: string | null
  rg?: string | null
  telefone?: string | null
  celular?: string | null
  email?: string | null
  emailNfe?: string | null
  site?: string | null
  endereco?: TinyEnderecoContato
  enderecoCobranca?: TinyEnderecoContato
  situacao?: string | null    // 'B' | 'A' | 'I' | 'E'
  observacoes?: string | null
  dataCriacao?: string | null
  dataAtualizacao?: string | null
  limiteCredito?: number | null
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapAddress(addr?: TinyEnderecoContato | null): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.endereco || undefined,
    address2: addr.complemento || undefined,
    city: addr.municipio || undefined,
    region: addr.uf || undefined,
    postalCode: addr.cep || undefined,
    country: undefined, // Tiny provides UF only; country is implicitly Brazil
  }
}

function mapSituacao(situacao?: string | null): boolean {
  // 'B' = ativo, 'A' = ativo com acesso ao sistema → active
  // 'I' = inativo, 'E' = excluído → inactive
  return situacao === 'B' || situacao === 'A'
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformContact(raw: TinyContato): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []
  const telephones: Telephone[] = []
  if (raw.telefone) telephones.push({ telephone: raw.telefone, type: 'WORK' })
  if (raw.celular) telephones.push({ telephone: raw.celular, type: 'MOBILE' })

  // Determine isCustomer / isSupplier from tipoPessoa context.
  // Tiny's unified API does not expose a "type" flag for customer vs supplier;
  // by convention we default both flags true for unified contacts.
  const isCompany = raw.tipoPessoa === 'J' || raw.tipoPessoa === 'E' || raw.tipoPessoa === 'X'

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.nome || raw.fantasia || undefined,
    companyName: isCompany ? (raw.nome || undefined) : (raw.fantasia || undefined),
    identification: raw.codigo || undefined,
    taxNumber: raw.cpfCnpj || undefined,
    isCustomer: true,
    isSupplier: true,
    isActive: mapSituacao(raw.situacao),
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(raw.enderecoCobranca ?? raw.endereco),
    shippingAddress: mapAddress(raw.endereco),
    createdAt: raw.dataCriacao ? new Date(raw.dataCriacao) : undefined,
    updatedAt: raw.dataAtualizacao ? new Date(raw.dataAtualizacao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
