import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite設定ファイル（CSSとJSを単一出力し、スタンドアロンHTMLおよびGitHub Pagesに最適化する設定）
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    cssCodeSplit: false,
  },
  server: {
    port: 5173,
    host: true,
  },
});
