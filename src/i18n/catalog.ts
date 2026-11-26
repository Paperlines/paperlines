import type { MessageKey } from "./en";

/**
 * A translation: the same keys as en.ts, plus plural forms the language needs (`key.one`, `key.few`,
 * `key.many`…; the plain key is the "other" form). `i18n.test.ts` checks that every key is there
 * and that each string keeps the English one's {placeholders}.
 */
export type Catalog = Partial<Record<MessageKey | `${MessageKey}.${Intl.LDMLPluralRule}`, string>>;
