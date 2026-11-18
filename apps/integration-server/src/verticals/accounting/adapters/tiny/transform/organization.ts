/**
 * Tiny ERP v3 — DadosDaEmpresa (company / organization) transforms.
 *
 * Endpoint: GET /info
 * Response type: ObterInfoContaModelResponse (from TinyERPv3-SDK)
 *
 * `regimeTributario` values:
 *   1 = Simples Nacional
 *   2 = Simples Nacional Excesso Receita
 *   3 = Regime Normal
 *   4 = MEI
 */

import type { Organization } from '../../../schema/organization'
import type { Address } from '../../../schema/shared'

// ── Tiny raw types ─────────────────────────────────────────────────────────────

export interface TinyEnderecoEmpresa {
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

export interface TinyInfoConta {
  razaoSocial?: string | null
  cpfCnpj?: string | null
  fantasia?: string | null
  enderecoEmpresa?: TinyEnderecoEmpresa | null
  fone?: string | null
  email?: string | null
  inscricaoEstadual?: string | null
  regimeTributario?: number | null
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────────

function mapAddress(addr?: TinyEnderecoEmpresa | null): Address | undefined {
  if (!addr) return undefined
  return {
    address1: addr.endereco || undefined,
    address2: addr.complemento || undefined,
    city: addr.municipio || undefined,
    region: addr.uf || undefined,
    postalCode: addr.cep || undefined,
    country: undefined, // Tiny provides UF; country is implicitly Brazil
  }
}

export function transformOrganization(raw: TinyInfoConta): Organization {
  return {
    name: raw.fantasia || raw.razaoSocial || undefined,
    legalName: raw.razaoSocial || undefined,
    taxNumber: raw.cpfCnpj || undefined,
    address: mapAddress(raw.enderecoEmpresa),
    metadata: raw as Record<string, unknown>,
  }
}
