import { reactive } from 'vue'

// Keep in-flight writes locked per account even across page unmounts or A → B → A switches.
const locks = new WeakMap<object, Set<string>>()
export function useRanchActionLock(owner: object) {
  let pending = locks.get(owner)
  if (!pending) {
    pending = reactive(new Set<string>())
    locks.set(owner, pending)
  }
  return pending
}
