import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 预构建为自包含 ESM 插件：Vue 运行时内联，CSS 拆出为 plugin.css 由宿主注入。
export default defineConfig({
  plugins: [vue()],
  define: {
    // Vue 的 esm-bundler 构建依赖打包器替换 process.env.NODE_ENV，必须显式定义
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
