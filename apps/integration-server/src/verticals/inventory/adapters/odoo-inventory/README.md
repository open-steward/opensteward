# Odoo Inventory adapter

Odoo's Inventory and Purchase apps, over the shared Odoo client
(`@opensteward/shared` `adapter/odoo`): JSON-2 (`/json/2/<model>/<method>`)
on Odoo 19+, External RPC (`/jsonrpc` `execute_kw`) on Odoo 14–18, as the
connection chooses.

Auth: the shared Odoo form — Odoo URL, API version, database, login and API
key. Connections made with this adapter's old single-API-key form must be
reconnected.

Webhook: none. Odoo documents no webhook signature, so every inbound request
is refused.

## Resources

| Canonical       | Odoo model                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| Products        | `product.product`                                                          |
| Stock levels    | `stock.quant` in `internal` / `transit` locations                          |
| Locations       | `stock.location`                                                           |
| Stock transfers | `stock.picking` with picking type code `internal`, lines from `stock.move` |
| Purchase orders | `purchase.order`, lines from `purchase.order.line`                         |

## Refused (501)

- Suppliers — Odoo has no supplier model (a vendor is a `res.partner`).
- Stock adjustments — Odoo has no adjustment document; counts are applied
  to `stock.quant` as `stock.move` rows.

Lists page with `search_read` `offset` / `limit` in id order, with
`search_count` for the total.

## Caveats for callers

- **Archived records.** Lists use `search_read`, which applies Odoo's default
  `active` filter, so `listProducts` / `listLocations` return only active
  rows. `getProduct` / `getLocation` use `read`, which does not filter, so an
  archived record is still returned by id, with `isActive: false`.
- **Units of measure.** Quantities are passed through in Odoo's units, not
  normalised: stock levels in the product's default unit, purchase-order lines
  in the line's unit, transfer lines in the move's unit. The canonical lines
  have no unit field.
- **Unit prices** are rounded to the currency's minor unit (Odoo stores
  `price_unit` / `standard_price` with more digits).
- **Stock-level ids** are `stock.quant` ids. Odoo deletes zero quants and
  merges duplicates, so an id can disappear or change.
- **Odoo 14–18.** Field sets differ by version (`stock.move.quantity` is 17.0+,
  `quantity_done` before; `warehouse_id` on quants is 16.0+, on locations
  15.0+). The shared client asks `fields_get` first and reads only fields the
  server has; a missing warehouse leaves `metadata.warehouseId` absent.
  Purchase orders in the 14–18 `done` (Locked) state are treated as confirmed.
