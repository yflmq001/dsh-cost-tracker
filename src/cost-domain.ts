/**
 * Storage-domain spec for the cross-session global bill.
 *
 * The domain's single global record holds the running total; it is loaded at
 * open and rewritten on each change feed delta (debounced by the caller).
 *
 * @module dsh-cost-tracker/cost-domain
 */

import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { globalBillSchema, zeroBill } from './billing.ts'

/** The `cost_tracker` storage domain: one global record, no tables. */
export const costDomainSpec = defineDomain({
  name: 'cost_tracker',
  version: 1,
  global: {
    schema: globalBillSchema,
    initial: zeroBill(),
  },
  tables: {},
})
