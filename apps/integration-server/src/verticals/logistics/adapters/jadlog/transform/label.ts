import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * Raw shape for a DACTE (Documento Auxiliar do CT-e) label record
 * returned by the Jadlog Embarcador API.
 *
 * Jadlog labels are referenced via a URL to the DACTE PDF document.
 * The `cte` field is the CT-e number which uniquely identifies the document.
 */
export interface JadlogLabelResponse {
  idpedido?: string | number | null
  codigo?: string | null
  cte?: string | null
  urlDacte?: string | null        // hosted DACTE PDF URL
  urlEtiqueta?: string | null     // hosted shipping label URL
  dtEmissao?: string | null
  modalidade?: number | null
  [key: string]: unknown
}

export function transformLabel(raw: JadlogLabelResponse): Label {
  const id = raw.cte ?? (raw.idpedido != null ? String(raw.idpedido) : undefined)
  const url = raw.urlEtiqueta ?? raw.urlDacte ?? undefined

  return {
    id,
    shipmentId: raw.idpedido != null ? String(raw.idpedido) : undefined,
    trackingNumber: raw.codigo ?? raw.cte ?? undefined,
    carrierId: 'jadlog',
    serviceCode: raw.modalidade != null ? String(raw.modalidade) : undefined,
    format: 'PDF',
    status: 'CREATED',
    url,
    createdAt: toISODate(raw.dtEmissao),
    metadata: raw as Record<string, unknown>,
  }
}
