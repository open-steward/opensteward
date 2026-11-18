/**
 * Why a platform does not provide a listable resource, read from the
 * adapter's own declaration: `verticals/<vertical>/adapters/<slug>/metadata.ts`
 * `unavailableResources[].reason`. The sync worker asks for it
 * (`SyncWorkerOptions.unavailableReason`) for every resource an adapter has
 * no list method for, so a sync report says "Not provided by bokio: …"
 * rather than a bare 'skipped'.
 *
 * Until this, nothing read those declarations at runtime; only
 * scripts/check-adapter-declarations.ts did, statically. The resource ↔ method
 * match here is that script's: strip the verb, singularise, lowercase, and
 * compare with the declared name with hyphens dropped (`listTaxRates` ↔
 * `taxrate`, `listPurchaseOrders` ↔ `purchaseorder`), plus its one ecommerce
 * alias (`listInventoryLevels` ↔ `inventory`).
 *
 * An adapter without a metadata.ts, or one that declares nothing for the
 * resource, answers `undefined` and keeps the bare skip. Each adapter's
 * declaration is loaded at most once per process.
 */
import type { ListableResource } from '@opensteward/shared'

interface Declaration {
  unavailableResources?: ReadonlyArray<{ resource: string; reason: string }>
}

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/

const METHOD_KEY_ALIASES: Record<string, Record<string, string>> = {
  ecommerce: { inventorylevel: 'inventory' },
}

function singularise(stem: string): string {
  if (/ies$/.test(stem)) return stem.replace(/ies$/, 'y')
  if (/[^s]s$/.test(stem)) return stem.slice(0, -1)
  return stem
}

/** `listTaxRates` → `taxrate`; the key check-adapter-declarations compares on. */
export function listMethodKey(vertical: string, method: string): string {
  const key = singularise(method.replace(/^list(?=[A-Z])/, '')).toLowerCase()
  return METHOD_KEY_ALIASES[vertical]?.[key] ?? key
}

/**
 * The import specifier of an adapter's declaration, relative to this module.
 * `.js`, not `.ts`: production runs the emitted `dist/`, where only the
 * `.js` exists. vitest and tsx resolve either extension to the source, so a
 * `.ts` here would pass every test and fail every lookup in production —
 * which is why the test pins this string rather than only the lookups.
 *
 * Built as a plain string, not a template literal: Vite rewrites a template
 * `import()` into a glob over existing `.js` files, which the TypeScript
 * sources are not, and every lookup under vitest then fails.
 */
export function declarationSpecifier(vertical: string, slug: string): string {
  return ['..', 'verticals', vertical, 'adapters', slug, 'metadata.js'].join('/')
}

async function loadDeclaration(vertical: string, slug: string): Promise<Declaration | undefined> {
  const specifier = declarationSpecifier(vertical, slug)
  try {
    const mod = (await import(specifier)) as {
      metadata?: Declaration
      default?: { metadata?: Declaration }
    }
    return mod.metadata ?? mod.default?.metadata
  } catch {
    return undefined
  }
}

/**
 * A resolver for one vertical's sync worker. `load` is injectable for tests;
 * the default imports the adapter's metadata module.
 */
export function unavailableReasonResolver(
  vertical: string,
  load: (vertical: string, slug: string) => Promise<Declaration | undefined> = loadDeclaration,
): (platform: string, resource: ListableResource) => Promise<string | undefined> {
  const cache = new Map<string, Promise<Declaration | undefined>>()
  return async (platform, resource) => {
    if (!SAFE_SEGMENT.test(vertical) || !SAFE_SEGMENT.test(platform)) return undefined
    let declaration = cache.get(platform)
    if (declaration === undefined) {
      declaration = load(vertical, platform)
      cache.set(platform, declaration)
    }
    const want = listMethodKey(vertical, resource.method)
    const entry = (await declaration)?.unavailableResources?.find(
      (u) => u.resource.replace(/-/g, '').toLowerCase() === want,
    )
    return entry?.reason || undefined
  }
}
