/**
 * Guard test for the multi-scenario whole-body `examples` in the OpenAPI
 * specs. These are media-type `examples` (separate from the per-field `example`
 * coverage enforced by openapi-examples.test.ts). This test ensures a future
 * regen can't silently drop them — it asserts a few representative operations /
 * shared responses still carry a non-empty `examples` map, and that the specs
 * carry a healthy overall count.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const repoRoot = join(__dirname, '..', '..', '..')
const load = (f: string) => JSON.parse(readFileSync(join(repoRoot, f), 'utf8')) as Record<string, any>

/** Count media-type `examples` maps anywhere under a `content` block. */
function countMediaExamples(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  let n = 0
  const obj = node as Record<string, unknown>
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'content' && value && typeof value === 'object') {
      for (const media of Object.values(value as Record<string, any>)) {
        if (media && typeof media === 'object' && media.examples && Object.keys(media.examples).length > 0) n++
      }
    }
    n += countMediaExamples(value)
  }
  return n
}

describe('OpenAPI scenario examples', () => {
  it('dev API: shared error responses carry named examples', () => {
    const dev = load('docs/openapi/openapi.json')
    const badRequest = dev.components?.responses?.BadRequest?.content?.['application/json']?.examples
    expect(badRequest && Object.keys(badRequest).length).toBeGreaterThan(1)
  })

  it('dev API: carries a healthy number of whole-body examples', () => {
    const dev = load('docs/openapi/openapi.json')
    expect(countMediaExamples(dev.paths) + countMediaExamples(dev.components?.responses)).toBeGreaterThan(40)
  })

  it('admin API: auth.login carries multiple response examples', () => {
    const admin = load('docs/openapi/admin-api.openapi.json')
    const login = admin.paths?.['/api/auth/login']?.post?.responses?.['200']?.content?.['application/json']?.examples
    expect(login && Object.keys(login).length).toBeGreaterThan(1)
  })

  it('admin API: carries a healthy number of whole-body examples', () => {
    const admin = load('docs/openapi/admin-api.openapi.json')
    expect(countMediaExamples(admin.paths)).toBeGreaterThan(10)
  })
})
