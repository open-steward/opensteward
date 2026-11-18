import type { Organization } from '../../../schema/organization'

/**
 * Bling v3 empresa (company) shape from GET /empresas/me/dados-basicos.
 * Returns basic data for the authenticated company.
 * id is a string UUID; cnpj is the Brazilian taxpayer ID.
 */
export interface BlingEmpresa {
  id?: string | number
  nome?: string
  cnpj?: string
  email?: string
  dataContrato?: string
  [key: string]: unknown
}

export function transformOrganization(raw: BlingEmpresa): Organization {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.nome || undefined,
    taxNumber: raw.cnpj || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
