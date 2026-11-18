import type { Carrier } from '../../../schema/carrier'

/**
 * One row of "Courier List" (GET https://shipment.xpressbees.com/api/courier,
 * https://documenter.getpostman.com/view/15188467/2s9YyzcxWT):
 * `{ "id": "6", "name": "Air Xpressbees 0.5 K.G" }`.
 */
export interface XpressbeesCourierRaw {
  id?: string | null
  name?: string | null
}

/** `{ "status": true, "data": [ { "id": "6", "name": "..." }, ... ] }` */
export interface XpressbeesCourierListResponse {
  status?: boolean | null
  data?: XpressbeesCourierRaw[] | null
  message?: string | null
}

export function transformCarrier(raw: XpressbeesCourierRaw): Carrier {
  if (raw.id == null || raw.id === '') throw new Error('Xpressbees courier row has no id')
  const id = String(raw.id)
  return {
    id,
    name: raw.name ?? undefined,
    // Order Booking takes this id back as "courier_id  numeric courier id".
    code: id,
    metadata: raw as Record<string, unknown>,
  }
}
