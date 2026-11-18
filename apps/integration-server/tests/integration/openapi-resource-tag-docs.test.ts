import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every vertical's `openapi.ts` authors a per-resource `tags` array with real
 * documentation — cross-platform caveats a caller needs, not filler.
 * `generate-openapi.ts` discarded the whole array and pushed one generic tag
 * per vertical, so none of it reached Swagger UI, the SDK, the CLI or
 * docs/platforms.md. An engineer editing one of those descriptions got no
 * signal the edit was inert; an edit to the orders caveat went
 * nowhere.
 *
 * The issue offered two remedies. Unioning the resource tags into the spec and
 * re-tagging operations is not viable here:
 *
 *   - `deriveCommandPath` in packages/cli/scripts/generate-commands.ts derives
 *     every CLI command path from `tags[0]`, so putting a resource tag first
 *     would rename the entire CLI surface.
 *   - Resource names are not unique across verticals. `orders`, `contacts`,
 *     `providers` and `webhooks` are each authored by two or three verticals
 *     with different meanings, so a union would merge accounting's `orders`
 *     with logistics' under one description.
 *
 * So one Swagger group per vertical stays, and the authored descriptions are
 * folded into that vertical's tag description instead. This asserts against
 * the committed artifact, because the artifact is what every downstream
 * consumer reads.
 */

const spec = JSON.parse(
  readFileSync(join(__dirname, '../../../../docs/openapi/openapi.json'), 'utf8'),
) as { tags: Array<{ name: string; description: string }> }

function tag(name: string): { name: string; description: string } {
  const found = spec.tags.find((t) => t.name === name)
  if (!found) throw new Error(`no tag ${name} in the generated spec`)
  return found
}

describe('generated spec carries the authored resource documentation', () => {
  it('keeps the orders/salesorders double-counting caveat reachable', () => {
    // The specific content an earlier change added and that never shipped.
    const d = tag('Accounting').description
    expect(d).toMatch(/double-count/i)
    expect(d).toMatch(/salesorders/)
  })

  it('names the accounting resources the vertical authored', () => {
    const d = tag('Accounting').description
    for (const r of ['invoices', 'bills', 'purchaseorders', 'creditmemos']) {
      expect(d).toContain(r)
    }
  })

  it('carries logistics and crm resource documentation too', () => {
    expect(tag('Logistics').description.length).toBeGreaterThan(200)
    expect(tag('CRM').description.length).toBeGreaterThan(200)
  })

  it('leaves a vertical that authored no resource tags with its base description', () => {
    // docsign authors none, so it must not gain an empty resource section.
    const d = tag('Docsign').description
    expect(d).toContain('vertical')
    expect(d).not.toMatch(/Resources\s*$/)
  })

  it('still lists exactly one tag per vertical plus the shared ones', () => {
    // Grouping is unchanged — this is what protects the CLI command paths.
    const names = spec.tags.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Accounting')
    expect(names).not.toContain('orders')
    expect(names).not.toContain('salesorders')
  })
})
