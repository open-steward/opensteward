/**
 * `Aggregator.knownVertical()` gates every `/api/verticals/:vertical/*` route
 * on the list in config.yml. That list stopped at four while the platform grew
 * to nine, so payments, docsign, projects, customer-support and inventory
 * 404'd at admin-api even though integration-server served them happily —
 * 616 adapters unreachable, and no way to enable or configure any of them
 * through the admin UI.
 *
 * Reads the shipped YAML rather than a constant: the file is what compose
 * mounts into the container, so it is the thing that has to be right.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { load } from 'js-yaml'

/** Every vertical integration-server registers. */
const EXPECTED = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
]

function shippedVerticals(): string[] {
  const path = resolve(__dirname, '../../config/config.yml')
  const parsed = load(readFileSync(path, 'utf8')) as { verticals?: Array<{ name: string }> }
  return (parsed.verticals ?? []).map((v) => v.name)
}

describe('admin-api config.yml', () => {
  it('lists every vertical the platform serves', () => {
    expect(shippedVerticals().sort()).toEqual([...EXPECTED].sort())
  })

  it('points every vertical at a backend URL', () => {
    const path = resolve(__dirname, '../../config/config.yml')
    const parsed = load(readFileSync(path, 'utf8')) as {
      verticals?: Array<{ name: string; url?: string }>
    }
    for (const v of parsed.verticals ?? []) {
      expect(v.url, `${v.name} has no url`).toBeTruthy()
    }
  })
})
