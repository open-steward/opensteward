#!/usr/bin/env tsx
/**
 * Fetches SVG/PNG logos for every provider across all 9 verticals via the
 * Brandfetch Logo API and writes them to apps/integration-server/public/logos/.
 *
 * Secret lives in `.env.scripts` at the repo root (see `.env.scripts.example`).
 *
 * Flags:
 *   --slug=<slug>   fetch only one provider (matches across all verticals)
 *   --vertical=<v>  restrict to one vertical (accounting|crm|ecommerce|logistics|payments|docsign|projects|customer-support|inventory)
 *   --force         overwrite existing non-placeholder files
 */
import path from 'node:path'
import { fetchLogos, type PlatformLike } from '@opensteward/codegen'

import { PLATFORMS as ACCOUNTING } from '../src/verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM } from '../src/verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE } from '../src/verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS } from '../src/verticals/logistics/platforms/metadata'
import { PLATFORMS as PAYMENTS } from '../src/verticals/payments/platforms/metadata'
import { PLATFORMS as DOCSIGN } from '../src/verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS } from '../src/verticals/projects/platforms/metadata'
import { PLATFORMS as SUPPORT } from '../src/verticals/customer-support/platforms/metadata'
import { PLATFORMS as INVENTORY } from '../src/verticals/inventory/platforms/metadata'

type SnakePlatform = {
  slug: string
  name: string
  website: string
  auth_type: string
  category?: string
  primary_color?: string
  hq_country?: string
  docs_url?: string
  pricing_url?: string
  founded_year?: number
  description?: string
}

function fromSnake(p: SnakePlatform): PlatformLike {
  return {
    slug: p.slug,
    name: p.name,
    website: p.website,
    authType: p.auth_type,
    category: p.category,
    primaryColor: p.primary_color,
    hqCountry: p.hq_country,
    docsUrl: p.docs_url,
    pricingUrl: p.pricing_url,
    foundedYear: p.founded_year,
    description: p.description,
  }
}

const VERTICALS: Record<string, PlatformLike[]> = {
  accounting: ACCOUNTING.map(fromSnake),
  crm: CRM.map(fromSnake),
  ecommerce: ECOMMERCE.map(fromSnake),
  logistics: LOGISTICS.map(fromSnake),
  payments: PAYMENTS.map(fromSnake),
  docsign: DOCSIGN.map(fromSnake),
  projects: PROJECTS.map(fromSnake),
  'customer-support': SUPPORT.map(fromSnake),
  inventory: INVENTORY.map(fromSnake),
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const slug = args.find((a) => a.startsWith('--slug='))?.split('=')[1]
  const verticalFilter = args.find((a) => a.startsWith('--vertical='))?.split('=')[1]
  const force = args.includes('--force')

  if (verticalFilter && !(verticalFilter in VERTICALS)) {
    console.error(`Unknown vertical "${verticalFilter}". Expected one of: ${Object.keys(VERTICALS).join(', ')}`)
    process.exit(1)
  }

  const outputDir = path.resolve(__dirname, '..', '..', '..', 'docs', 'platforms', 'logos')
  const envPath = path.resolve(__dirname, '..', '..', '..', '.env.scripts')

  const targets = verticalFilter ? [verticalFilter] : Object.keys(VERTICALS)
  let totalFetched = 0
  let totalSkipped = 0
  let totalNotFound = 0

  for (const v of targets) {
    const providers = VERTICALS[v]
    const filtered = slug ? providers.filter((p) => p.slug === slug) : providers
    if (filtered.length === 0) continue

    console.log(`\n▶ ${v} (${filtered.length} provider${filtered.length === 1 ? '' : 's'})`)
    const { fetched, skipped, notFound } = await fetchLogos(filtered, outputDir, {
      force,
      envPath,
    })
    totalFetched += fetched
    totalSkipped += skipped
    totalNotFound += notFound
  }

  console.log(
    `\nTotal — fetched: ${totalFetched}, skipped: ${totalSkipped}, not found: ${totalNotFound}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
