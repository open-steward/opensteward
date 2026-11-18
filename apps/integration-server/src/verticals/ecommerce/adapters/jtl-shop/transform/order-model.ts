/**
 * JTL-Shop REST `OrderModel` (table `tbestellung`) → canonical Order.
 *
 * From https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Models/OrderModel.php:
 *
 *   "$attributes['id']                       = DataAttribute::create('kBestellung', 'int', null, false, true);"
 *   "$attributes['customerID']               = DataAttribute::create('kKunde', 'int', self::cast('0', 'int'), false);"
 *   "$attributes['orderNO']                  = DataAttribute::create(" / "'cBestellNr',"
 *   "$attributes['comment']                  = DataAttribute::create('cKommentar', 'mediumtext');"
 *
 * Not mapped, on purpose: the order carries `total` ("fGesamtsumme") and a
 * `currencyID` ("kWaehrung"), a foreign key, but no currency code, so no
 * Money can be built without guessing a currency. `state` ("cStatus", a
 * char) has no documented value list. `created` is a zone-less shop-local
 * datetime. The model has no line-item collection (its only nested
 * collection is `attributes`). All of these stay in `metadata`.
 */
import type { Order } from '../../../schema/order'

export interface JtlOrderModel {
  id: number
  customerID?: number | null
  orderNO?: string | null
  comment?: string | null
  [key: string]: unknown
}

export function transformOrderModel(raw: JtlOrderModel): Order {
  if (typeof raw.id !== 'number' || !Number.isInteger(raw.id) || raw.id <= 0) {
    throw new Error(`JTL-Shop order has no usable id: ${JSON.stringify(raw.id)}`)
  }
  const out: Order = { id: String(raw.id), metadata: { ...raw } }
  if (typeof raw.orderNO === 'string' && raw.orderNO !== '') out.orderNumber = raw.orderNO
  // kKunde defaults to 0 ("self::cast('0', 'int')"): no customer record.
  if (typeof raw.customerID === 'number' && raw.customerID > 0) {
    out.customerId = String(raw.customerID)
  }
  if (typeof raw.comment === 'string' && raw.comment !== '') out.note = raw.comment
  return out
}
