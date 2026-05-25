import { defineConfig } from 'vitest/config'

// Unit tests target pure TS modules in lib/** (grading, adaptive, scheduler,
// session). They must not depend on the Supabase or Next.js runtime, so a plain
// node environment is enough.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
