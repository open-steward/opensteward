/**
 * A resource whose every adapter method throws the 501 NOT_SUPPORTED refusal
 * serves nothing, so `metadata.ts` must not declare it available —
 * check:adapter-declarations reports that pairing as `refused` (a stale
 * declaration). Each row here was one. Pin both halves together: the resource
 * is declared unavailable, and its reason is the refusal's own explanation
 * (the text after "<Vendor> cannot list <x>: ", capitalised), so the
 * declaration and the 501 body cannot drift apart.
 */
import { describe, expect, it } from 'vitest'
import { ADAPTER_FACTORIES } from '../../../../src/verticals/docsign/adapter/factories'

const CELLS: ReadonlyArray<readonly [slug: string, resource: string, listMethod: string]> = [
  ['agiloft', 'audit-trail-entry', 'listAuditTrailEntries'],
  ['agiloft', 'document', 'listDocuments'],
  ['comsigntrust', 'audit-trail-entry', 'listAuditTrailEntries'],
  ['legaldesk', 'audit-trail-entry', 'listAuditTrailEntries'],
  ['legaldesk', 'document', 'listDocuments'],
  ['legaldesk', 'signer', 'listSigners'],
  ['linksquares', 'audit-trail-entry', 'listAuditTrailEntries'],
  ['linksquares', 'signer', 'listSigners'],
  ['signdesk', 'audit-trail-entry', 'listAuditTrailEntries'],
  ['signdesk', 'document', 'listDocuments'],
  ['signdesk', 'signer', 'listSigners'],
  ['zorrosign', 'document', 'listDocuments'],
  ['zorrosign', 'signer', 'listSigners'],
]

interface Metadata {
  totalResources: number
  availableResources: readonly string[]
  unavailableResources: ReadonlyArray<{ resource: string; reason: string }>
}

async function loadMetadata(slug: string): Promise<Metadata> {
  const mod = (await import(`../../../../src/verticals/docsign/adapters/${slug}/metadata.ts`)) as {
    metadata: Metadata
  }
  return mod.metadata
}

async function refusal(
  slug: string,
  listMethod: string,
): Promise<{ message: string; code: unknown; statusCode: unknown }> {
  const factory = ADAPTER_FACTORIES[slug]
  if (factory === undefined) throw new Error(`no factory for ${slug}`)
  const adapter = factory({}) as unknown as Record<string, (arg: unknown) => Promise<unknown>>
  const method = adapter[listMethod]
  if (method === undefined) throw new Error(`${slug} has no ${listMethod}`)
  try {
    await method.call(adapter, {})
  } catch (err) {
    const e = err as { message: string; code?: unknown; statusCode?: unknown }
    return { message: e.message, code: e.code, statusCode: e.statusCode }
  }
  throw new Error(`${slug}.${listMethod} did not refuse`)
}

/**
 * Every method the adapter defines that addresses `resource` — list, get and
 * any write — named the way scripts/check-adapter-declarations.ts names them:
 * strip the verb, singularise, lowercase. The gate reports a resource
 * `refused` only when all of them refuse, so the test calls all of them, not
 * just the list method.
 */
const VERB =
  /^(?:list|get|create|update|delete|cancel|void|capture|pay|detach|submit|adjust|set|schedule)(?=[A-Z])/
const STEM_ALIASES: Record<string, string> = { inventorylevel: 'inventory' }

function methodsFor(adapter: object, resource: string): string[] {
  const want = resource.replace(/-/g, '').toLowerCase()
  const names = new Set<string>()
  for (
    let p: object | null = adapter;
    p !== null && p !== Object.prototype;
    p = Object.getPrototypeOf(p) as object | null
  ) {
    for (const n of Object.getOwnPropertyNames(p)) names.add(n)
  }
  return [...names].filter((n) => {
    const stem = n.replace(VERB, '')
    if (stem === n) return false
    let key = stem
    if (/ies$/.test(key)) key = key.replace(/ies$/, 'y')
    else if (/[^s]s$/.test(key)) key = key.slice(0, -1)
    key = key.toLowerCase()
    return (STEM_ALIASES[key] ?? key) === want
  })
}

describe('docsign: refused resources are declared unavailable with the refusal as reason', () => {
  it.each(CELLS)('%s declares %s unavailable', async (slug, resource, listMethod) => {
    const metadata = await loadMetadata(slug)
    const { message, code, statusCode } = await refusal(slug, listMethod)
    expect(code).toBe('NOT_SUPPORTED')
    expect(statusCode).toBe(501)

    const tail = /^.+? cannot list [^:]+: ([\s\S]+)$/.exec(message)?.[1]
    expect(tail, message).toBeDefined()
    const expected = tail!.charAt(0).toUpperCase() + tail!.slice(1)

    expect(metadata.availableResources).not.toContain(resource)
    const entries = metadata.unavailableResources.filter((u) => u.resource === resource)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.reason).toBe(expected)
    expect(metadata.availableResources.length + metadata.unavailableResources.length).toBe(
      metadata.totalResources,
    )

    const adapter = ADAPTER_FACTORIES[slug]!({}) as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    const methods = methodsFor(adapter, resource)
    expect(methods).toContain(listMethod)
    for (const name of methods) {
      await expect(adapter[name]!.call(adapter, {}, 'x', {}), name).rejects.toMatchObject({
        code: 'NOT_SUPPORTED',
        statusCode: 501,
      })
    }
  })
})
