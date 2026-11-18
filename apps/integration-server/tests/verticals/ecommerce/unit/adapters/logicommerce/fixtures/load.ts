/**
 * The documented example responses of LogiCommerce API Sync, extracted
 * verbatim from the reference pages at
 * https://api-sync.logicommerce.cloud/docs/reference.cfm?module=<module>&languageId=2
 * (modules products, categories, physicalLocations, accounts and sales).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

export function fixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, `${name}.json`), 'utf8')) as T
}
