/**
 * CI guard: every adapter that ships a webhook handler must register a
 * verifier in its vertical's WEBHOOK_HANDLERS map. Without this check,
 * an adapter could drop `verifyWebhook` and the gateway would still
 * accept unsigned bodies (because the unified router only fails-closed
 * when NO handler is registered — when a handler exists but doesn't
 * verify, behaviour falls to the adapter).
 *
 * Heuristic: a webhook handler ships when `webhook.ts` exists under the
 * adapter directory. For each such adapter we then confirm that the
 * vertical's webhook-aggregator imports it.
 *
 * Run: `pnpm tsx scripts/check-webhook-verifiers.ts`.
 * Exit 0 when everything checks out, 1 otherwise.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')
const VERTICALS_DIR = join(REPO_ROOT, 'apps/integration-server/src/verticals')
// Every vertical directory, so a new vertical is covered without an edit here.
// The list was hard-coded to five and silently skipped the other four.
const VERTICALS = readdirSync(VERTICALS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

interface Issue {
  vertical: string
  platform: string
  reason: string
}

function adapterDirs(vertical: string): string[] {
  const dir = join(VERTICALS_DIR, vertical, 'adapters')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

function adapterShipsWebhook(vertical: string, platform: string): boolean {
  return existsSync(join(VERTICALS_DIR, vertical, 'adapters', platform, 'webhook.ts'))
}

function aggregatorRegisters(vertical: string, platform: string): boolean {
  const aggregator = join(VERTICALS_DIR, vertical, 'webhooks.ts')
  if (!existsSync(aggregator)) return false
  const src = readFileSync(aggregator, 'utf8')
  // We don't require an exact match — `./adapters/<platform>/webhook`
  // anywhere in the aggregator source is enough.
  return src.includes(`./adapters/${platform}/webhook`)
}

const issues: Issue[] = []
let checked = 0

for (const vertical of VERTICALS) {
  for (const platform of adapterDirs(vertical)) {
    if (!adapterShipsWebhook(vertical, platform)) continue
    checked += 1
    if (!aggregatorRegisters(vertical, platform)) {
      issues.push({
        vertical,
        platform,
        reason:
          `apps/integration-server/src/verticals/${vertical}/webhooks.ts ` +
          `does not import './adapters/${platform}/webhook' — the verifier ` +
          'will not be reachable, and the gateway will reject this platform ' +
          'with 501 WEBHOOK_HANDLER_NOT_FOUND.',
      })
    }
  }
}

// `--soft` exits 0 even when issues are found, but still prints them.
// Useful while gaps are being closed: report without breaking builds.
// Drop the flag once the issue count reaches zero to make the check
// enforcing.
const soft = process.argv.includes('--soft')

if (issues.length === 0) {
  console.log(`webhook verifiers: OK (${checked} adapters with webhook.ts, all registered)`)
  process.exit(0)
}

const stream = soft ? console.warn : console.error
stream(`webhook verifiers: ${issues.length} problem(s) (of ${checked} adapters with webhook.ts):`)
for (const i of issues) {
  stream(`  - ${i.vertical}/${i.platform}: ${i.reason}`)
}
process.exit(soft ? 0 : 1)

// Avoid an empty top-level (suppress TS warning about unused statSync).
void statSync
