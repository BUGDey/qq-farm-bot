import { createApp, h } from 'vue'
import MilkTeaActivityPanel from './MilkTeaActivityPanel.vue'

/**
 * 活动插件前端入口（宿主契约 apiVersion 1）。
 *
 * 宿主通过 import(entryUrl) 加载本模块，并调用 mount(el, host)：
 *   host = {
 *     api,          // 宿主 axios 实例（自动携带 x-admin-token / x-account-id）
 *     getAccountId, // () => 当前账号 id（切账号时宿主会卸载重挂）
 *     window,       // { startMs, endMs } 活动有效期（毫秒）
 *     onBack,       // 返回活动列表
 *   }
 * 返回 { unmount } 供宿主在切走/过期时卸载。
 */
export function mount(el, host = {}) {
  const app = createApp({
    render: () => h(MilkTeaActivityPanel, {
      host,
      onBack: () => host.onBack?.(),
    }),
  })
  app.mount(el)
  return {
    unmount: () => {
      try { app.unmount() } catch { /* 已卸载 */ }
    },
  }
}

export default { mount }
