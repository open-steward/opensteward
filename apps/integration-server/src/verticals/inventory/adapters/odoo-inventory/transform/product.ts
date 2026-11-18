import type { Product } from '../../../schema/product'
import {
  currencyCode,
  many2oneId,
  many2oneName,
  meta,
  minor,
  odooIso,
  strOrUndef,
  type Many2one,
} from '../values'

/**
 * A `product.product` row. `product.product` has
 * `_inherits = {'product.template': 'product_tmpl_id'}`, so the template's
 * fields read through it (addons/product/models/product_product.py, 19.0):
 *   default_code = fields.Char('Internal Reference', index=True)
 *   lst_price = fields.Float('Sales Price', compute='_compute_product_lst_price', …)
 *   standard_price = fields.Float('Cost', company_dependent=True, …)
 *   active = fields.Boolean(
 *   barcode = fields.Char(
 * and from product_template.py, 19.0:
 *   name = fields.Char('Name', index='trigram', required=True, translate=True)
 *   categ_id = fields.Many2one(
 *   currency_id = fields.Many2one('res.currency', 'Currency', compute='_compute_currency_id')
 *   cost_currency_id = fields.Many2one('res.currency', 'Cost Currency', compute='_compute_cost_currency_id')
 * `create_date` / `write_date` are the ORM's log-access fields.
 */
export interface RawOdooProduct {
  id: number
  name?: string | false
  default_code?: string | false
  barcode?: string | false
  categ_id?: Many2one
  lst_price?: number | false
  currency_id?: Many2one
  standard_price?: number | false
  cost_currency_id?: Many2one
  active?: boolean
  product_tmpl_id?: Many2one
  create_date?: string | false
  write_date?: string | false
}

export const PRODUCT_FIELDS = [
  'id',
  'name',
  'default_code',
  'barcode',
  'categ_id',
  'lst_price',
  'currency_id',
  'standard_price',
  'cost_currency_id',
  'active',
  'product_tmpl_id',
  'create_date',
  'write_date',
]

export function transformProduct(raw: RawOdooProduct): Product {
  const priceCurrency = currencyCode(raw.currency_id)
  const costCurrency = currencyCode(raw.cost_currency_id)
  const retail = minor(raw.lst_price, priceCurrency)
  const cost = minor(raw.standard_price, costCurrency)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // default_code is optional in Odoo; an empty SKU says there is none.
    sku: strOrUndef(raw.default_code) ?? '',
    name: strOrUndef(raw.name) ?? '',
    category: many2oneName(raw.categ_id),
    ...(retail !== undefined && priceCurrency
      ? { retailPrice: { amount: retail, currency: priceCurrency } }
      : {}),
    ...(cost !== undefined && costCurrency
      ? { cost: { amount: cost, currency: costCurrency } }
      : {}),
    isActive: raw.active === true,
    // product.supplierinfo rows (seller_ids) are not suppliers; suppliers are refused.
    supplierIds: [],
    createdAt: odooIso(raw.create_date),
    updatedAt: odooIso(raw.write_date),
    platform: 'odoo-inventory',
    metadata: meta({
      barcode: strOrUndef(raw.barcode),
      productTemplateId: many2oneId(raw.product_tmpl_id),
    }),
    raw,
  }
}
