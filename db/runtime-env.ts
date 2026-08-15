import { AsyncLocalStorage } from "node:async_hooks";

export type RuntimeBindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

type BindingRegistry = typeof globalThis & {
  __alsalamBindingStorage?: AsyncLocalStorage<RuntimeBindings>;
};

const registry = globalThis as BindingRegistry;
const storage =
  registry.__alsalamBindingStorage ??
  (registry.__alsalamBindingStorage = new AsyncLocalStorage<RuntimeBindings>());

export function runWithBindings<T>(
  bindings: RuntimeBindings,
  callback: () => T,
): T {
  return storage.run(bindings, callback);
}

export function getBindings(): RuntimeBindings {
  const bindings = storage.getStore();
  if (!bindings) throw new Error("Runtime bindings are unavailable");
  return bindings;
}
