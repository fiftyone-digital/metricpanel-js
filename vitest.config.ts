import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        url: 'https://customer.example/',
      },
    },
    include: ['./*.test.ts'],
  },
})
