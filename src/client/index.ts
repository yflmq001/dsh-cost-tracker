/** Browser plugin owning the per-session cost readout on the composer dock. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CostBar } from './CostBar.tsx'
import { en, NS, zh, type CostBarKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'cost-tracker': CostBarKey
  }
}

export const inject = ['slots', 'locale']

/**
 * Register the cost readout into the composer dock (stats-line family, after
 * the shipped stats strip) and its locale dictionary.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cost-tracker: browser dictionaries')
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'cost',
    order: 10,
    locale: NS,
  }, CostBar))
}
