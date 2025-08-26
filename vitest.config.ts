import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      '.nuxt',
      '.vercel',
      '.turbo',
      'extensions/*/dist/**',
      'extensions/*/node_modules/**'
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'extensions/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types.ts'
      ]
    }
  }
})