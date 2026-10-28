import { createApp, h } from 'vue'
import SolarTermsActivityPanel from './SolarTermsActivityPanel.vue'

/**
 * 节令小札插件前端入口（宿主契约 apiVersion 1）。
 * mount(el, host) 的 host = { api, getAccountId, window, onBack, toast }；
 * 常驻活动 window 为 { startMs: 0, endMs: Number.MAX_SAFE_INTEGER }。
 */
export function mount(el, host = {}) {
  const app = createApp({
    render: () => h(SolarTermsActivityPanel, {
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
