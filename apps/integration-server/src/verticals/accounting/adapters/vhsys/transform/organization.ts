/**
 * vhsys organization (empresa / configurações da conta) transform.
 *
 * vhsys exposes the tenant company information under the "empresa" or
 * account configuration endpoint.
 *
 * Endpoints:
 *   GET /empresa   — get company/organization info
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysEmpresa {
  id_empresa?: string | number
  razao_empresa?: string
  fantasia_empresa?: string
  cnpj_empresa?: string
  ie_empresa?: string
  email_empresa?: string
  fone_empresa?: string
  site_empresa?: string
  endereco_empresa?: string
  numero_empresa?: string
  complemento_empresa?: string
  bairro_empresa?: string
  cep_empresa?: string
  cidade_empresa?: string
  uf_empresa?: string
  moeda_padrao?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: VhsysEmpresa): Organization {
  const addrParts = [raw.endereco_empresa, raw.numero_empresa, raw.complemento_empresa].filter(Boolean)
  const address = toAddress({
    address1: addrParts.join(', ') || undefined,
    address2: raw.bairro_empresa || undefined,
    city: raw.cidade_empresa || undefined,
    postalCode: raw.cep_empresa || undefined,
    region: raw.uf_empresa || undefined,
    country: raw.uf_empresa ? 'BR' : undefined,
  })

  return {
    id: raw.id_empresa !== undefined ? String(raw.id_empresa) : undefined,
    name: raw.fantasia_empresa || raw.razao_empresa || undefined,
    legalName: raw.razao_empresa || undefined,
    taxNumber: raw.cnpj_empresa || undefined,
    currency: raw.moeda_padrao || 'BRL',
    website: raw.site_empresa || undefined,
    address,
    metadata: raw as Record<string, unknown>,
  }
}
