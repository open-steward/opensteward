/**
 * Regression pin for a production crashloop that 85,595 passing tests missed.
 *
 * Bumping js-yaml 4 -> 5 removed its default export. `apps/docs-server` is the
 * only app that compiles to native ESM (`module: nodenext`), so its
 * `import yaml from 'js-yaml'` became fatal at boot:
 *
 *   SyntaxError: The requested module 'js-yaml' does not provide an export
 *   named 'default'
 *
 * The container restart-looped. Every other app survived only because it emits
 * CommonJS, where TypeScript's `__importDefault` shim synthesises a default.
 *
 * WHY NO TEST CAUGHT IT: vitest transforms modules through esbuild, which
 * applies its own CJS/ESM interop and happily invents the missing default. The
 * container runs `node dist/index.js` — real ESM, strict about it. So the unit
 * suite structurally cannot observe this class of bug, and a green suite is not
 * evidence that the built artifact boots.
 *
 * This is a static proxy for that class, not a cure: it pins the specific
 * import form across the repo. The real coverage is booting the built image,
 * which only the docker path does today.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')

/** Every tracked .ts file that imports js-yaml, via git so it ignores build output. */
function sourceFilesImporting(pkg: string): string[] {
  const out = execFileSync('git', ['grep', '-l', `from '${pkg}'`, '--', '*.ts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

describe('js-yaml is never default-imported', () => {
  it('no source file uses `import yaml from "js-yaml"`', () => {
    const offenders: string[] = []
    for (const rel of sourceFilesImporting('js-yaml')) {
      const src = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
      // A default import is `import <ident> from '...'` — no braces, no `* as`.
      if (/^\s*import\s+[A-Za-z_$][\w$]*\s+from\s+['"]js-yaml['"]/m.test(src)) {
        offenders.push(rel)
      }
    }
    expect(
      offenders,
      `js-yaml 5 has no default export. Use \`import * as yaml from 'js-yaml'\` ` +
        `(works under both ESM and CJS) or a named import. Offending file(s): ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('the guard can actually see the files it claims to check', () => {
    // Guards that silently match nothing pass forever. Pin that js-yaml is
    // genuinely imported somewhere, so a rename cannot hollow this out.
    expect(sourceFilesImporting('js-yaml').length).toBeGreaterThan(3)
  })
})
