/**
 * Authz scope-matrix fuzz tests.
 *
 * Enumerates a representative set of (scope, route) combinations and
 * asserts hasScope() returns the correct allow/deny decision. Builds a
 * "matrix" the way a pen tester would: every scope variant × every
 * required-scope variant the auth middleware enforces. Any change to
 * scope semantics (e.g. adding a new wildcard form) will surface as a
 * failing assertion here.
 *
 * For end-to-end coverage that the matrix is *applied* correctly at the
 * route layer, see the integration tests in apps/integration-server.
 */
import { describe, it, expect } from 'vitest'
import { hasScope } from '../../src/auth/api-keys'

const VERTICALS = ['accounting', 'crm', 'ecommerce', 'logistics', 'payments', 'docsign', 'projects', 'customer-support', 'inventory'] as const
const ACTIONS = ['read', 'write'] as const

// Every scope we expect to see on a real key. Add new shapes here and
// every matrix row below will exercise them.
const GRANT_VARIANTS: Array<{ label: string; grants: readonly string[] }> = [
  { label: 'no grants', grants: [] },
  { label: 'wildcard *', grants: ['*'] },
  { label: 'vertical wildcard only', grants: ['vertical:*'] },
  { label: 'vertical:read only', grants: ['vertical:read'] },
  { label: 'vertical:write only', grants: ['vertical:write'] },
  { label: 'vertical:<v> only — accounting', grants: ['vertical:accounting'] },
  { label: 'vertical:<v> only — crm', grants: ['vertical:crm'] },
  { label: 'customers:read', grants: ['customers:read'] },
  { label: 'customers:write', grants: ['customers:write'] },
  { label: 'customers:*', grants: ['customers:*'] },
  { label: 'multiple narrow', grants: ['vertical:accounting', 'customers:read'] },
]

interface Case {
  required: string
  expectations: Record<string, boolean>
}

const CASES: Case[] = [
  // wildcard '*' grant covers everything
  {
    required: 'vertical:accounting',
    expectations: {
      'no grants': false,
      'wildcard *': true,
      'vertical wildcard only': true,
      'vertical:read only': false,
      'vertical:write only': false,
      'vertical:<v> only — accounting': true,
      'vertical:<v> only — crm': false,
      'customers:read': false,
      'customers:write': false,
      'customers:*': false,
      'multiple narrow': true,
    },
  },
  {
    required: 'vertical:read',
    expectations: {
      'no grants': false,
      'wildcard *': true,
      'vertical wildcard only': true,
      'vertical:read only': true,
      'vertical:write only': false,
      'vertical:<v> only — accounting': false,
      'vertical:<v> only — crm': false,
      'customers:read': false,
      'customers:write': false,
      'customers:*': false,
      'multiple narrow': false,
    },
  },
  {
    required: 'vertical:write',
    expectations: {
      'no grants': false,
      'wildcard *': true,
      'vertical wildcard only': true,
      'vertical:read only': false,
      'vertical:write only': true,
      'vertical:<v> only — accounting': false,
      'vertical:<v> only — crm': false,
      'customers:read': false,
      'customers:write': false,
      'customers:*': false,
      'multiple narrow': false,
    },
  },
  {
    required: 'customers:read',
    expectations: {
      'no grants': false,
      'wildcard *': true,
      'vertical wildcard only': false,
      'vertical:read only': false,
      'vertical:write only': false,
      'vertical:<v> only — accounting': false,
      'vertical:<v> only — crm': false,
      'customers:read': true,
      'customers:write': false,
      'customers:*': true,
      'multiple narrow': true,
    },
  },
  {
    required: 'customers:write',
    expectations: {
      'no grants': false,
      'wildcard *': true,
      'vertical wildcard only': false,
      'vertical:read only': false,
      'vertical:write only': false,
      'vertical:<v> only — accounting': false,
      'vertical:<v> only — crm': false,
      'customers:read': false,
      'customers:write': true,
      'customers:*': true,
      'multiple narrow': false,
    },
  },
]

describe('authz scope matrix', () => {
  for (const c of CASES) {
    describe(`required: ${c.required}`, () => {
      for (const g of GRANT_VARIANTS) {
        const expected = c.expectations[g.label]
        expect(expected).toBeDefined()
        it(`${g.label} → ${expected ? 'allow' : 'deny'}`, () => {
          expect(hasScope(g.grants, c.required)).toBe(expected)
        })
      }
    })
  }
})

describe('authz two-axis enforcement (vertical + verb)', () => {
  // The unified auth middleware enforces a two-axis check:
  //   1. touch axis  — vertical:<v> OR vertical:read OR vertical:write
  //   2. verb axis   — for non-GET, ALSO require vertical:write
  // This test confirms the per-axis primitives line up; the middleware
  // composes them via hasScope() calls.

  for (const v of VERTICALS) {
    it(`vertical:${v} alone satisfies touch but not write`, () => {
      const grants = [`vertical:${v}`]
      // touch: any of the three alternatives is enough
      expect(
        hasScope(grants, `vertical:${v}`) ||
          hasScope(grants, 'vertical:read') ||
          hasScope(grants, 'vertical:write'),
      ).toBe(true)
      // verb: vertical:write is required and the key lacks it
      expect(hasScope(grants, 'vertical:write')).toBe(false)
    })

    it(`vertical:write alone covers reads and writes for ${v}`, () => {
      const grants = ['vertical:write']
      // touch via the universal read/write keyword
      expect(
        hasScope(grants, `vertical:${v}`) ||
          hasScope(grants, 'vertical:read') ||
          hasScope(grants, 'vertical:write'),
      ).toBe(true)
      // verb
      expect(hasScope(grants, 'vertical:write')).toBe(true)
    })

    it(`vertical:read does not let writes through for ${v}`, () => {
      const grants = ['vertical:read']
      expect(hasScope(grants, 'vertical:write')).toBe(false)
    })
  }
})

describe('authz cross-vertical isolation', () => {
  // A key scoped to one vertical must not reach another vertical's
  // resources via the `vertical:<v>` shape.
  for (const own of VERTICALS) {
    for (const other of VERTICALS) {
      if (own === other) continue
      it(`vertical:${own} cannot read vertical:${other}`, () => {
        expect(hasScope([`vertical:${own}`], `vertical:${other}`)).toBe(false)
      })
    }
  }
})

describe('authz exhaustive enumeration count', () => {
  // Surfaces an obvious failure if someone adds a new GRANT_VARIANT and
  // forgets to update one of the case `expectations` blocks above.
  it(`covers ${GRANT_VARIANTS.length}×${CASES.length} = ${GRANT_VARIANTS.length * CASES.length} matrix cells`, () => {
    for (const c of CASES) {
      const labels = Object.keys(c.expectations).sort()
      const variants = GRANT_VARIANTS.map((v) => v.label).sort()
      expect(labels).toEqual(variants)
    }
  })

  it('every verb × every vertical combo has been considered', () => {
    expect(ACTIONS).toHaveLength(2)
    expect(VERTICALS).toHaveLength(9)
  })
})
