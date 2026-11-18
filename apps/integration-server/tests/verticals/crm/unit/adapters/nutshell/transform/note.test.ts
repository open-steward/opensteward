import { describe, it, expect } from 'vitest'
import {
  transformNote,
  untransformNote,
} from '../../../../../../../src/verticals/crm/adapters/nutshell/transform/note'

describe('nutshell transformNote', () => {
  it('throws because Nutshell does not support Notes API', () => {
    expect(() => transformNote({})).toThrow('Nutshell')
  })
})

describe('nutshell untransformNote', () => {
  it('throws because Nutshell does not support Notes API', () => {
    expect(() => untransformNote({})).toThrow('Nutshell')
  })
})
