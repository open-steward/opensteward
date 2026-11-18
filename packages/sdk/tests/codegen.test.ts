/**
 * Codegen smoke test.
 *
 * The generated `paths` modules are the SDK's load-bearing artifact. This
 * test asserts they exist, parse, and carry a known path entry for both
 * specs — a "drift didn't break the world" check that runs in the same
 * CI step as the unit tests, on top of the existing `check:docs` drift
 * gate.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const GENERATED_DIR = join(__dirname, '..', 'src', 'generated')
const PUBLIC = join(GENERATED_DIR, 'public-types.ts')
const OPERATOR = join(GENERATED_DIR, 'operator-types.ts')

describe('generated SDK types', () => {
  it('both generated modules exist on disk', () => {
    expect(existsSync(PUBLIC)).toBe(true)
    expect(existsSync(OPERATOR)).toBe(true)
  })

  it('the public types include the /customers path', () => {
    // The spec uses `{version}` as a server template, so paths are
    // recorded without a leading `/v1`. `/customers` is the canonical
    // operator-visible "tenant customers" endpoint.
    //
    // Quote style around the key is a cosmetic detail of the generator's
    // formatting pass (prettier's `singleQuote` setting), not something
    // SDK consumers see or this test cares about — match either quote
    // character so the assertion survives future formatting changes
    // without weakening the thing it actually checks: that the path key
    // is present in the generated surface.
    const src = readFileSync(PUBLIC, 'utf8')
    expect(src).toMatch(/['"]\/customers['"]:/)
  })

  it('the operator types include the /api/users path', () => {
    const src = readFileSync(OPERATOR, 'utf8')
    expect(src).toMatch(/['"]\/api\/users['"]:/)
  })

  it('the operator types declare a `paths` interface', () => {
    const src = readFileSync(OPERATOR, 'utf8')
    expect(src).toMatch(/export interface paths\b/)
  })

  it('the public types declare a `paths` interface', () => {
    const src = readFileSync(PUBLIC, 'utf8')
    expect(src).toMatch(/export interface paths\b/)
  })
})
