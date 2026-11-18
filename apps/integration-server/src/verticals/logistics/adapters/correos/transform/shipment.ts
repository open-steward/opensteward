import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface CorreosShipmentResponse {
  codigoEnvio: string
  codigoSeguimiento?: string
  codigoServicio?: string
  estado?: string
  fechaCreacion?: string
  [key: string]: unknown
}

export function transformShipment(raw: CorreosShipmentResponse): Shipment {
  return {
    id: raw.codigoEnvio,
    status: 'LABEL_CREATED',
    trackingNumber: raw.codigoSeguimiento ?? undefined,
    carrierId: 'correos',
    serviceCode: raw.codigoServicio ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.fechaCreacion) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
