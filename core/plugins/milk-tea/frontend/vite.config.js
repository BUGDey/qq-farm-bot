import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 预构建为自包含 ESM 插件：Vue 运行时内联进 plugin.mjs（宿主页面无需 import map，
// 双 Vue 实例共存），CSS 拆出为 plugin.css 由宿主按需注入。
export default defineConfig({
  plugins: [vue()],
  // Vue 的 esm-bundler 构建依赖打包器替换 process.env.NODE_ENV；lib 产物在浏览器
  // 直接运行，必须显式定义为 production，否则运行时报 process is not defined。
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VUE_OPTIONS_API': 'false',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/main.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'plugin.mjs',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some(name => name.endsWith('.css')) || assetInfo.name?.endsWith('.css'))
            return 'plugin.css'
          return '[name][extname]'
        },
      },
    },
  },
})
