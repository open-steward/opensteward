#!/usr/bin/env tsx
/**
 * CLA signature check.
 *
 * OpenSteward is source-available (Elastic-2.0 + Additional Use Grant, see
 * LICENSE). Under a plain inbound=outbound rule a contribution would arrive
 * licensed under those same restricted terms, which would leave the project
 * unable to license that code commercially — one merged patch is enough to
 * make a file unlicensable. CLA.md fixes that by having contributors grant
 * relicensing rights *in addition to* the rights they already keep. This
 * script is what stops an unsigned contribution being merged by accident.
 *
 * Signing is self-service and lives in git rather than in a bot's database:
 * a contributor adds themselves to `.github/cla-signatures.json` in their own
 * pull request, so the agreement is recorded as a commit authored by them.
 * That is stronger evidence than a bot-recorded comment, and it needs no
 * third-party action holding write permissions on this repo.
 *
 * Usage:
 *   pnpm check:cla                  # validate the ledger only
 *   pnpm check:cla <username>       # also assert that author has signed
 *
 * In CI the username comes from PR_AUTHOR (see .github/workflows/cla.yml).
 * Errors exit 1.
 *
 * Runs via `pnpm check:cla`.
 */
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..')
const LEDGER_PATH = join(REPO_ROOT, '.github', 'cla-signatures.json')
const LEDGER_REL = '.github/cla-signatures.json'

type Signature = {
  username?: unknown
  name?: unknown
  signedAt?: unknown
  note?: unknown
}

type Ledger = {
  claDocument?: unknown
  claVersion?: unknown
  exempt?: unknown
  signatures?: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// GitHub logins: alphanumeric plus single hyphens, 1-39 chars. Bot accounts
// carry a `[bot]` suffix, which is why the exempt list is matched separately
// rather than being validated against this pattern.
const LOGIN_RE = /^[A-Za-z\d](?:[A-Za-z\d]|-(?=[A-Za-z\d])){0,38}$/

const errors: string[] = []

function fail(msg: string): void {
  errors.push(msg)
}

function readLedger(): Ledger | null {
  if (!existsSync(LEDGER_PATH)) {
    fail(`${LEDGER_REL} is missing — the CLA ledger must exist for the check to be meaningful`)
    return null
  }
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger
  } catch (err) {
    fail(`${LEDGER_REL} is not valid JSON: ${(err as Error).message}`)
    return null
  }
}

function validate(ledger: Ledger): { signed: Set<string>; exempt: Set<string> } {
  const signed = new Set<string>()
  const exempt = new Set<string>()

  if (typeof ledger.claDocument !== 'string' || ledger.claDocument.length === 0) {
    fail(`${LEDGER_REL}: "claDocument" must name the agreement file (expected "CLA.md")`)
  } else if (!existsSync(join(REPO_ROOT, ledger.claDocument))) {
    fail(`${LEDGER_REL}: "claDocument" points at ${ledger.claDocument}, which does not exist`)
  }

  if (typeof ledger.claVersion !== 'number' || !Number.isInteger(ledger.claVersion)) {
    fail(`${LEDGER_REL}: "claVersion" must be an integer`)
  }

  if (ledger.exempt !== undefined) {
    if (!Array.isArray(ledger.exempt)) {
      fail(`${LEDGER_REL}: "exempt" must be an array of account names`)
    } else {
      for (const entry of ledger.exempt) {
        if (typeof entry !== 'string' || entry.length === 0) {
          fail(`${LEDGER_REL}: every "exempt" entry must be a non-empty string`)
          continue
        }
        exempt.add(entry.toLowerCase())
      }
    }
  }

  if (!Array.isArray(ledger.signatures)) {
    fail(`${LEDGER_REL}: "signatures" must be an array`)
    return { signed, exempt }
  }

  ledger.signatures.forEach((raw, i) => {
    const at = `${LEDGER_REL}: signatures[${i}]`
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      fail(`${at} must be an object`)
      return
    }
    const sig = raw as Signature

    if (typeof sig.username !== 'string' || sig.username.length === 0) {
      fail(`${at} is missing a "username" (your GitHub login)`)
    } else if (!LOGIN_RE.test(sig.username)) {
      fail(`${at} "username" ${JSON.stringify(sig.username)} is not a valid GitHub login`)
    } else {
      const key = sig.username.toLowerCase()
      if (signed.has(key)) fail(`${at} duplicates an earlier signature for "${sig.username}"`)
      signed.add(key)
    }

    if (typeof sig.name !== 'string' || sig.name.trim().length === 0) {
      fail(`${at} is missing a "name" — your real name, or your company's if signing for one`)
    }

    if (typeof sig.signedAt !== 'string' || !DATE_RE.test(sig.signedAt)) {
      fail(`${at} needs a "signedAt" date in YYYY-MM-DD form`)
    } else if (Number.isNaN(Date.parse(sig.signedAt))) {
      fail(`${at} "signedAt" ${JSON.stringify(sig.signedAt)} is not a real date`)
    }
  })

  return { signed, exempt }
}

function main(): void {
  const ledger = readLedger()
  if (!ledger) {
    for (const e of errors) console.error(`✗  ${e}`)
    process.exit(1)
  }

  const { signed, exempt } = validate(ledger)

  // The author to assert on: CLI arg wins, then CI's PR_AUTHOR. Absent both,
  // this is a ledger-validation-only run (what a local `pnpm check:cla` does).
  const author = (process.argv[2] ?? process.env['PR_AUTHOR'] ?? '').trim()

  if (author.length > 0) {
    const key = author.toLowerCase()
    if (exempt.has(key)) {
      console.log(
        `[check:cla] ${author} is on the exempt list (automation account) — no signature required.`,
      )
    } else if (!signed.has(key)) {
      fail(
        `${author} has not signed the CLA.\n` +
          `\n` +
          `    To sign, add yourself to ${LEDGER_REL} in this pull request:\n` +
          `\n` +
          `        {\n` +
          `          "username": ${JSON.stringify(author)},\n` +
          `          "name": "Your Name",\n` +
          `          "signedAt": "${new Date().toISOString().slice(0, 10)}"\n` +
          `        }\n` +
          `\n` +
          `    Adding that entry as a commit authored by you IS the signature.\n` +
          `    Read CLA.md first — it is short, and you keep the copyright to\n` +
          `    your contribution. Questions are welcome before you sign.`,
      )
    }
  }

  for (const e of errors) console.error(`✗  ${e}`)
  console.log(
    `\n[check:cla] ${signed.size} signature(s) · ${exempt.size} exempt account(s) · ${errors.length} error(s)` +
      (author.length > 0 ? ` · checked "${author}"` : ' · ledger validation only'),
  )
  if (errors.length > 0) process.exit(1)
}

main()
