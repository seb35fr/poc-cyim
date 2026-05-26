// Wrapper de logs de diagnostic gates par import.meta.env.DEV.
// En prod : no-op total (pas d'appel a console.*, pas de cout, pas de fuite
// d'informations sur les structures internes / PII delegate dans la console).
// En dev : delegate vers console.log/table/group pour les diagnostics inline.
//
// Usage : import { debug } from "@/utils/debug.js"; debug.log("..."); debug.table([...]);
// Reserver console.error / console.warn aux erreurs operationnelles
// (echecs de fetch, fallbacks) qu'on veut voir aussi en prod.

const IS_DEV = import.meta.env.DEV;

const noop = () => {};

export const debug = {
  log: IS_DEV ? console.log.bind(console) : noop,
  table: IS_DEV ? console.table.bind(console) : noop,
  group: IS_DEV ? console.group.bind(console) : noop,
  groupEnd: IS_DEV ? console.groupEnd.bind(console) : noop,
};
