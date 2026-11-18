/**
 * Scaffold a new adapter by cloning a vertical's reference adapter.
 *
 * Copies `verticals/<vertical>/adapters/<reference>/` to `.../<slug>/`,
 * renames the exported adapter class to `<Pascal(slug)>Adapter`, and rewrites
 * the `platform = '<reference>'` field to `'<slug>'`. The result COMPILES
 * (it's a clone of a working adapter) and is the starting point an author then
 * edits — constants/auth/client/index/transform — to match the target API.
 *
 * It does NOT touch `factories.ts` or `metadata.ts` (those shared files are
 * edited in a single serial step to avoid concurrent-write races); instead it
 * prints the exact factory import + line to add.
 *
 * Usage:
 *   pnpm scaffold:adapter <vertical> <slug> <reference-slug>
 *   pnpm scaffold:adapter payments helcim stripe
 *
 * Exit 1 on bad args, missing reference, or an already-existing target dir.
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')

function pascal(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ''))
    .join('')
}

function die(msg: string): never {
  console.error(`scaffold-adapter: ${msg}`)
  process.exit(1)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const [vertical, slug, reference] = process.argv.slice(2)
if (!vertical || !slug || !reference) {
  die('usage: pnpm scaffold:adapter <vertical> <slug> <reference-slug>')
}
if (!/^[a-z0-9-]+$/.test(slug)) die(`slug must be kebab-case ([a-z0-9-]): got "${slug}"`)

const adaptersDir = join(VERTICALS_DIR, vertical, 'adapters')
const srcDir = join(adaptersDir, reference)
const dstDir = join(adaptersDir, slug)

if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
  die(`reference adapter not found: ${srcDir}`)
}
if (existsSync(dstDir)) die(`target already exists: ${dstDir}`)

// Discover the reference's exported adapter class name from its index.ts.
const refIndex = readFileSync(join(srcDir, 'index.ts'), 'utf8')
const classMatch = refIndex.match(/export class (\w*Adapter)\b/)
if (!classMatch) die(`could not find "export class XAdapter" in ${reference}/index.ts`)
const refClass = classMatch[1]
const newClass = `${pascal(slug)}Adapter`

// Clone the directory, then rewrite class name + platform id in every .ts file.
cpSync(srcDir, dstDir, { recursive: true })
let filesTouched = 0
for (const file of walk(dstDir)) {
  if (!file.endsWith('.ts')) continue
  let src = readFileSync(file, 'utf8')
  const before = src
  src = src.split(refClass).join(newClass)
  // Only the adapter's own platform-identity literal, not arbitrary strings.
  src = src.replace(new RegExp(`(readonly\\s+platform\\s*=\\s*)'${reference}'`), `$1'${slug}'`)
  src = src.replace(new RegExp(`(platform:\\s*)'${reference}'`), `$1'${slug}'`)
  if (src !== before) filesTouched++
  writeFileSync(file, src)
}

const quotedKey = /^[a-z][a-z0-9]*$/.test(slug) ? slug : `'${slug}'`
console.log(`scaffold-adapter: cloned ${vertical}/${reference} -> ${vertical}/${slug}`)
console.log(
  `  class ${refClass} -> ${newClass}; platform -> '${slug}'; ${filesTouched} file(s) rewritten`,
)
console.log(
  `\nNext: edit ${dstDir}/{constants,auth,client,index,transform/*}.ts for the target API, then add to`,
)
console.log(`  ${vertical}/adapter/factories.ts:`)
console.log(`    import { ${newClass} } from '../adapters/${slug}'`)
console.log(`    ${quotedKey}: factory(${newClass}),`)
console.log(
  `  ${vertical}/platforms/metadata.ts: add the PlatformMetadata entry (from missing_platforms.json).`,
)
console.log(
  `  Then: pnpm check:adapter-parity && pnpm --filter integration-server exec tsc --noEmit`,
)

void statSync
