/**
 * The scope-group form's presets, as reported from /scope-groups/new:
 * "selecting the Read-write preset selects all scopes, and then selecting the
 * Read-only preset does not change the selected scopes."
 *
 * The preset code returned early when the platform had no catalogued read
 * scopes — most platforms; curated read sets exist for a minority — so the
 * previous selection survived. A group the operator had just named
 * "Read-only" carried every write scope, and nothing on the page said so.
 *
 * Drives the extracted module directly (it holds no DOM references), loaded
 * the way tests/unit/customer-autocomplete.test.ts loads its script: in a
 * sandbox with no `document`, so only the logic is under test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Catalog = { readScopes?: string[]; recommendedScopes?: string[] }
type Presets = {
  presetScopes: (preset: string, catalog: Catalog) => string[] | null
  applyPresetTo: (
    selected: Set<string>,
    preset: string,
    catalog: Catalog,
  ) => { applied: boolean; catalogued: boolean }
}

function loadPresets(): Presets {
  const source = readFileSync(
    join(import.meta.dirname, '../../public/js/scope-group-presets.js'),
    'utf8',
  )
  const sandbox: Record<string, unknown> = {}
  new Function('globalThis', 'window', 'document', source)(sandbox, undefined, undefined)
  return sandbox.__scopeGroupPresets as Presets
}

// A platform with recommended scopes but no curated read set — the common case.
const NO_READ_SET: Catalog = {
  recommendedScopes: ['contacts.read', 'contacts.write', 'deals.read', 'deals.write'],
  readScopes: [],
}
// A platform with both.
const WITH_READ_SET: Catalog = {
  recommendedScopes: ['contacts.read', 'contacts.write', 'deals.read', 'deals.write'],
  readScopes: ['contacts.read', 'deals.read'],
}

let presets: Presets

beforeEach(() => {
  presets = loadPresets()
})

describe('Read-only after Read-write', () => {
  it('drops the write scopes when the platform catalogues a read set', () => {
    const selected = new Set<string>()
    presets.applyPresetTo(selected, 'read-write', WITH_READ_SET)
    expect([...selected].sort()).toEqual(WITH_READ_SET.recommendedScopes!.slice().sort())

    presets.applyPresetTo(selected, 'read-only', WITH_READ_SET)
    expect([...selected].sort()).toEqual(['contacts.read', 'deals.read'])
  })

  it('clears the selection when the platform has NO read set — the reported bug', () => {
    const selected = new Set<string>()
    presets.applyPresetTo(selected, 'read-write', NO_READ_SET)
    expect(selected.size).toBe(4)

    const result = presets.applyPresetTo(selected, 'read-only', NO_READ_SET)
    // Nothing is the honest read-only set here. Keeping the four write scopes
    // ticked under a group named "Read-only" was the failure.
    expect(selected.size).toBe(0)
    expect(result).toEqual({ applied: true, catalogued: false })
  })
})

describe('the other transitions', () => {
  it('Read-write after Read-only ticks every recommended scope', () => {
    const selected = new Set<string>()
    presets.applyPresetTo(selected, 'read-only', WITH_READ_SET)
    presets.applyPresetTo(selected, 'read-write', WITH_READ_SET)
    expect(selected.size).toBe(4)
  })

  it('Custom leaves whatever is ticked alone and reports nothing applied', () => {
    const selected = new Set(['contacts.read', 'something.custom'])
    const result = presets.applyPresetTo(selected, 'custom', WITH_READ_SET)
    expect([...selected].sort()).toEqual(['contacts.read', 'something.custom'])
    expect(result).toEqual({ applied: false, catalogued: false })
  })

  it('a platform change re-applies the preset against the NEW catalog, dropping the old one’s scopes', () => {
    const selected = new Set<string>()
    presets.applyPresetTo(selected, 'read-only', WITH_READ_SET)
    // The form re-applies the current preset after every platform fetch.
    presets.applyPresetTo(selected, 'read-only', {
      recommendedScopes: ['invoices.read', 'invoices.write'],
      readScopes: ['invoices.read'],
    })
    expect([...selected]).toEqual(['invoices.read'])
  })

  it('reports catalogued=true only when something was ticked', () => {
    const selected = new Set<string>()
    expect(presets.applyPresetTo(selected, 'read-write', WITH_READ_SET).catalogued).toBe(true)
    expect(
      presets.applyPresetTo(selected, 'read-write', { recommendedScopes: [] }).catalogued,
    ).toBe(false)
    expect(presets.applyPresetTo(selected, 'read-only', {}).catalogued).toBe(false)
  })
})
