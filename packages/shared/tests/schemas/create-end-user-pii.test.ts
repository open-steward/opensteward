/**
 * PII is optional when creating a customer, on every surface that says so.
 *
 * Forms build their PII object from whatever fields the operator filled in and
 * send `null` when that is none of them — the normal case where every PII
 * field is optional. Create must therefore accept `pii: null` exactly as
 * Update does (`.nullable().optional()`); a Create schema that says only
 * `optional()` refuses the New customer form's no-PII request with
 * `pii: Invalid input: expected object, received null`.
 *
 * The rule lives at three hops: admin-api's `CreateEndUserBody`, the shared
 * `CreateEndUserBodySchema` behind `/admin/end-users`, and the inline body for
 * the public `POST /v1/customers` — accepting null at only one hop leaves the
 * request failing at the next with an identical message. That is why this
 * test covers the shared schemas rather than one route.
 */
import { describe, it, expect } from 'vitest'
import {
  CreateEndUserBodySchema,
  UpdateEndUserBodySchema,
} from '../../src/schemas/end-user'

const BASE = { tenantId: 'default', email: 'jane@acme.example' }

describe('creating an end-user without PII', () => {
  it('accepts pii: null — what "none filled in" looks like on the wire', () => {
    const r = CreateEndUserBodySchema.safeParse({ ...BASE, pii: null })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.pii).toBeNull()
  })

  it('accepts pii being absent entirely', () => {
    expect(CreateEndUserBodySchema.safeParse(BASE).success).toBe(true)
  })

  it('still accepts real PII', () => {
    const r = CreateEndUserBodySchema.safeParse({
      ...BASE,
      pii: { firstName: 'Jane', lastName: 'Doe' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts only null or an object — a string is refused, by name', () => {
    const r = CreateEndUserBodySchema.safeParse({ ...BASE, pii: 'nope' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].path).toEqual(['pii'])
  })

  it('agrees with the update schema about this field', () => {
    // Create and Update must agree on this field — an asymmetry here means one
    // half of the resource refuses what the other accepts.
    // Different bodies otherwise — Update is .strict()
    // and carries no tenantId, since a customer cannot change tenant — so only
    // the field under test is held in common.
    expect(CreateEndUserBodySchema.safeParse({ ...BASE, pii: null }).success).toBe(true)
    expect(UpdateEndUserBodySchema.safeParse({ pii: null }).success).toBe(true)
  })
})
