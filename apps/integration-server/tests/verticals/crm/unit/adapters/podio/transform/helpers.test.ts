import { describe, it, expect } from 'vitest'
import {
  getFieldEntry,
  getFieldValue,
  getCategoryText,
  getRelationId,
  buildFields,
} from '../../../../../../../src/verticals/crm/adapters/podio/transform/helpers'
import type { PodioItemField } from '../../../../../../../src/verticals/crm/adapters/podio/client'

function makeField(externalId: string, values: Array<Record<string, unknown>>): PodioItemField {
  return { field_id: 1, external_id: externalId, values } as PodioItemField
}

describe('podio helpers', () => {
  describe('getFieldEntry', () => {
    it('returns first value for matching field', () => {
      const fields = [makeField('email', [{ value: 'a@b.com' }])]
      expect(getFieldEntry(fields, 'email')).toEqual({ value: 'a@b.com' })
    })

    it('returns undefined when field absent', () => {
      expect(getFieldEntry([], 'missing')).toBeUndefined()
    })

    it('returns undefined when values array is empty', () => {
      const fields = [makeField('email', [])]
      expect(getFieldEntry(fields, 'email')).toBeUndefined()
    })
  })

  describe('getFieldValue', () => {
    it('returns string value for text field', () => {
      const fields = [makeField('name', [{ value: 'Alice' }])]
      expect(getFieldValue(fields, 'name')).toBe('Alice')
    })

    it('coerces numeric value to string', () => {
      const fields = [makeField('count', [{ value: 42 }])]
      expect(getFieldValue(fields, 'count')).toBe('42')
    })

    it('returns undefined when field absent', () => {
      expect(getFieldValue([], 'name')).toBeUndefined()
    })
  })

  describe('getCategoryText', () => {
    it('returns text label for category field', () => {
      const fields = [makeField('status', [{ value: { text: 'Active', id: 1 } }])]
      expect(getCategoryText(fields, 'status')).toBe('Active')
    })

    it('returns undefined when field absent', () => {
      expect(getCategoryText([], 'status')).toBeUndefined()
    })

    it('returns undefined when value has no text key', () => {
      const fields = [makeField('status', [{ value: { id: 1 } }])]
      expect(getCategoryText(fields, 'status')).toBeUndefined()
    })
  })

  describe('getRelationId', () => {
    it('returns item_id as string', () => {
      const fields = [makeField('company', [{ value: { item_id: 999 } }])]
      expect(getRelationId(fields, 'company')).toBe('999')
    })

    it('returns undefined when field absent', () => {
      expect(getRelationId([], 'company')).toBeUndefined()
    })

    it('returns undefined when value has no item_id', () => {
      const fields = [makeField('company', [{ value: { title: 'Acme' } }])]
      expect(getRelationId(fields, 'company')).toBeUndefined()
    })
  })

  describe('buildFields', () => {
    it('includes non-empty pairs', () => {
      const result = buildFields([['name', [{ value: 'Alice' }]]])
      expect(result).toEqual({ name: [{ value: 'Alice' }] })
    })

    it('omits empty arrays', () => {
      const result = buildFields([
        ['name', [{ value: 'Alice' }]],
        ['phone', []],
      ])
      expect(result).not.toHaveProperty('phone')
      expect(result).toHaveProperty('name')
    })

    it('returns empty object when all pairs are empty', () => {
      expect(buildFields([['name', []], ['email', []]])).toEqual({})
    })
  })
})
