import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reads src/ only. Anything outside src/ and tests/ is outside turbo's test inputs (turbo.json),
// so package.json, LICENSE, fixtures/, README and workflow checks live in
// scripts/license-token-wiring.test.ts, which test:guard-scripts runs uncached.
const SRC = join(__dirname, '..', 'src')

function srcFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? srcFiles(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  )
}

const ALLOWED_IMPORTS = new Set(['node:crypto', 'zod'])

describe('src hygiene', () => {
  it('reads no environment variable (licensing never reads env; .env.example stays stable)', () => {
    for (const file of srcFiles())
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/process\.env/)
  })
  it('holds no private key material', () => {
    for (const file of srcFiles()) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/PRIVATE KEY|privateKeyJwk/)
    }
  })
  it('imports only node:crypto, zod and its own modules (no network, no fs: handover §5.9)', () => {
    for (const file of srcFiles()) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\brequire\(|\bimport\(/)
      // `from '…'` and side-effect `import '…'`, either quote style.
      for (const [, spec] of text.matchAll(/\b(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        expect(ALLOWED_IMPORTS.has(spec!) || spec!.startsWith('./'), `${file}: ${spec}`).toBe(true)
      }
    }
  })
})
