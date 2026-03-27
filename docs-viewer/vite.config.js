import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      'react': resolve('./node_modules/react'),
      'react-dom': resolve('./node_modules/react-dom'),
    }
  }
})