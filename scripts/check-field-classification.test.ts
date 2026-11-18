/**
 * Tests for the field-classification guard: one fixture per violation kind,
 * then the real registry, so the sidecars cannot drift from what the guard
 * accepts.
 *
 * Run: `pnpm exec tsx --test scripts/check-field-classification.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALLOWLIST,
  SENSITIVE_NAME,
  checkFieldClassification,
  type VerticalInput,
} from './check-field-classification.ts'

const shape = (...fields: string[]) => ({ shape: Object.fromEntries(fields.map((f) => [f, {}])) })

function vertical(over: Partial<VerticalInput> = {}): VerticalInput {
  return {
    listable: [{ resourceType: 'contacts' }],
    schemas: { contacts: shape('id', 'email', 'telephones', 'status') },
    classification: {
      contacts: {
        '*': { class: 'internal' },
        email: { class: 'pii', mask: 'email' },
        'telephones[].telephone': { class: 'pii', mask: 'phone' },
      },
    },
    ...over,
  }
}

const kinds = (r: ReturnType<typeof checkFieldClassification>) =>
  r.violations.map((v) => `${v.kind} ${v.id}`)

test('a fully classified vertical passes; nested pii covers its top-level field', () => {
  const r = checkFieldClassification({ crm: vertical() }, new Map())
  assert.deepEqual(kinds(r), [])
  assert.equal(r.checked, 1)
})

test('a listable type without a classification or schema fails', () => {
  const r = checkFieldClassification(
    { crm: vertical({ listable: [{ resourceType: 'contacts' }, { resourceType: 'deals' }] }) },
    new Map(),
  )
  assert.deepEqual(kinds(r), ['missing-classification crm/deals', 'missing-schema crm/deals'])
})

test('a classification for a non-listable type is an orphan', () => {
  const v = vertical()
  const r = checkFieldClassification(
    { crm: { ...v, classification: { ...v.classification, ghosts: {} } } },
    new Map(),
  )
  assert.deepEqual(kinds(r), ['orphan-classification crm/ghosts'])
})

test('a classified path naming a field the schema lacks fails (typo guard)', () => {
  const r = checkFieldClassification(
    {
      crm: vertical({
        classification: {
          contacts: {
            email: { class: 'pii' },
            'telephones[].telephone': { class: 'pii' },
            emial: { class: 'pii' },
          },
        },
      }),
    },
    new Map(),
  )
  assert.deepEqual(kinds(r), ['unknown-field crm/contacts/emial'])
})

test('a personal-looking field left internal fails unless allow-listed; stale entries fail', () => {
  const v = vertical({
    classification: { contacts: { '*': { class: 'internal' }, telephones: { class: 'pii' } } },
  })
  assert.deepEqual(kinds(checkFieldClassification({ crm: v }, new Map())), [
    'sensitive-unclassified crm/contacts/email',
  ])
  const allowed = new Map([['crm/contacts/email', 'test']])
  assert.deepEqual(kinds(checkFieldClassification({ crm: v }, allowed)), [])
  assert.deepEqual(kinds(checkFieldClassification({ crm: vertical() }, allowed)), [
    'stale-allowlist crm/contacts/email',
  ])
})

test('a pii default covers every field', () => {
  const r = checkFieldClassification(
    { crm: vertical({ classification: { contacts: { '*': { class: 'pii' } } } }) },
    new Map(),
  )
  assert.deepEqual(kinds(r), [])
})

test('SENSITIVE_NAME matches the documented spellings', () => {
  for (const f of [
    'email',
    'receiptEmail',
    'telephones',
    'first_name',
    'firstName',
    'lastName',
    'billingAddress',
    'iban',
    'taxId',
    'tax_id',
    'birthDate',
    'ssn',
  ]) {
    assert.ok(SENSITIVE_NAME.test(f), f)
  }
  for (const f of ['id', 'status', 'totalAmount', 'taxNumber'])
    assert.ok(!SENSITIVE_NAME.test(f), f)
})

test('the real registry passes with the checked-in allow-list', async () => {
  const { VERTICAL_CLASSIFICATIONS, listableResources } =
    await import('../apps/integration-server/src/data-access/classification-registry.ts')
  const r = checkFieldClassification(VERTICAL_CLASSIFICATIONS, ALLOWLIST)
  assert.deepEqual(kinds(r), [])
  assert.equal(r.checked, listableResources().length)
})
