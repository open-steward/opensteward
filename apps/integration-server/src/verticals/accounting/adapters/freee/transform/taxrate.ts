import type { TaxRate } from '../../../schema/taxrate'

/**
 * One item of GET /api/1/taxes/companies/{company_id}, as freee's OpenAPI
 * document declares it (all five fields required). There is no `id` and no
 * rate field: `code` is the tax_code that deals and manual journals take, so
 * it is the row's id, and `available` is the company's 使用設定.
 */
export interface FreeeTaxRate {
  code: number
  name: string
  name_ja: string
  display_category: string | null
  available: boolean
  [key: string]: unknown
}

/**
 * The rate a category displays, read from `display_category` — the item's only
 * rate signal. The spec's enum is `tax_<rate>` (tax_5, tax_8, tax_10),
 * `tax_r8` (軽減税率8%, the reduced 8%) and `tax_<rate>_e<80|70|50|30>`
 * (インボイス経過措置 <rate>%表示 <n>%控除: the invoice transition, still
 * displayed at <rate>%, with only <n>% creditable). `null` is 税率未設定税区分,
 * a category with no rate, so it has none here either.
 */
function displayedRate(category: string | null): number | undefined {
  const match = /^tax_r?(\d+)(?:_e\d+)?$/.exec(category ?? '')
  return match ? Number(match[1]) : undefined
}

export function transformTaxRate(raw: FreeeTaxRate): TaxRate {
  return {
    id: String(raw.code),
    name: raw.name_ja || undefined,
    description: raw.name_ja || undefined,
    rate: displayedRate(raw.display_category),
    isActive: typeof raw.available === 'boolean' ? raw.available : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
