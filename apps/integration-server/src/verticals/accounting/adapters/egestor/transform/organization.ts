/**
 * eGestor Empresa (Company) → canonical Organization transform.
 *
 * eGestor "empresa" endpoint: GET /api/v1/empresa
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface EgestorEmpresa {
  subdom?: string
  nome?: string
  fantasia?: string
  cpfcnpj?: string
  fones?: string
  emails?: string
  end?: string
  num?: string
  compl?: string
  bairro?: string
  cidadeNome?: string
  cidadeCod?: string
  uf?: string
  cep?: string
  cifrao?: string
  crt?: number
  atividade?: number
  pSimples?: number
  pICMS?: string
  pPIS?: string
  pCOFINS?: string
  inscMunicipal?: string
  tipoIE?: string
  inscEstadual?: string
  cnae?: string
  codTributMunicipio?: string
  regimeTributacao?: string
  [key: string]: unknown
}

export function transformOrganization(raw: EgestorEmpresa): Organization {
  const address = toAddress({
    address1: raw.end ? `${raw.end}${raw.num ? `, ${raw.num}` : ''}` : undefined,
    address2: raw.compl || raw.bairro || undefined,
    city: raw.cidadeNome || undefined,
    postalCode: raw.cep || undefined,
    region: raw.uf || undefined,
    country: 'BR',
  })

  return {
    name: raw.fantasia || raw.nome || undefined,
    legalName: raw.nome || undefined,
    taxNumber: raw.cpfcnpj || undefined,
    address,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
