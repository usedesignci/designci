import type { Rule } from '../domain/rule.js'
import { duplicateToken } from './duplicate-token.js'
import { missingToken } from './missing-token.js'
import { tokenValueMismatch } from './token-value-mismatch.js'

export { duplicateToken } from './duplicate-token.js'
export { missingToken } from './missing-token.js'
export { tokenValueMismatch } from './token-value-mismatch.js'

/**
 * Every rule the engine ships, in a fixed order. The runner sorts its output, so
 * this order does not affect results — it is the order rules execute in, which
 * matters only for how a profiler reads.
 */
export const allRules: readonly Rule[] = [tokenValueMismatch, missingToken, duplicateToken]
