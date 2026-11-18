/**
 * Andreani REST API v2 — etiquetas response → canonical Label.
 *
 * GET /v2/ordenes-de-envio/{numeroAndreani}/etiquetas returns a PDF binary
 * (Content-Type: application/pdf). The endpoint also accepts a `tipo` query
 * param for label variants. The response body is the raw PDF bytes; there is
 * no JSON envelope with tracking fields — those come from the order response.
 *
 * We model the label from the orden's bulto entry, which carries:
 *   - numeroBulto  (label/package id)
 *   - numeroEnvio  (tracking number)
 *   - etiqueta     (URL to the individual label PDF)
 *
 * Docs: https://developers.andreani.com/documentacion
 * Source reference: https://github.com/nchsala/andreani (src/models/ordenes.model.ts)
 */
import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Andreani raw types ────────────────────────────────────────────────────

export interface AndreaniLabelBulto {
  numeroBulto?: string | null
  numeroEnvio?: string | null
  /** URL to retrieve the individual label PDF. */
  etiqueta?: string | null
  [key: string]: unknown
}

export interface AndreaniLabelOrden {
  /** URL to retrieve all labels for this order as a single PDF. */
  etiquetaAgrupador?: string | null
  etiquetaRemito?: string | null
  fechaCreacion?: string | null
  descripcionServicio?: string | null
  bultos?: AndreaniLabelBulto[] | null
  contrato?: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(
  raw: AndreaniLabelOrden,
  bultoIndex = 0,
): Label {
  const bulto = raw.bultos?.[bultoIndex] ?? raw.bultos?.[0]

  return {
    id: bulto?.numeroBulto ?? bulto?.numeroEnvio ?? undefined,
    shipmentId: bulto?.numeroEnvio ?? undefined,
    trackingNumber: bulto?.numeroEnvio ?? undefined,
    carrierId: 'andreani',
    serviceCode: raw.descripcionServicio ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: bulto?.etiqueta ?? raw.etiquetaAgrupador ?? raw.etiquetaRemito ?? undefined,
    createdAt: toISODate(raw.fechaCreacion),
    metadata: raw as Record<string, unknown>,
  }
}
