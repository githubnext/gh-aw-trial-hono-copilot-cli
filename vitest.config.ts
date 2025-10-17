import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./.vitest.config/setup-vitest.ts'],
    // Performance optimizations for faster test execution
    // These settings reduce test overhead while maintaining correctness
    maxConcurrency: 16, // Allow more tests to run concurrently (default: CPU cores)
    isolate: false, // Faster execution by reusing test environment (safe for Hono tests)
    poolOptions: {
      threads: {
        singleThread: false, // Enable parallel execution in threads
        isolate: false, // Reuse worker threads for better performance
      },
    },
    // Note: fileParallelism defaults to true, which is optimal
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage/raw/default',
      reporter: ['json', 'text', 'html'],
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        'benchmarks',
        'runtime-tests',
        'build/build.ts',
        'src/test-utils',
        'perf-measures',

        // types are compile-time only, so their coverage cannot be measured
        'src/**/types.ts',
        'src/jsx/intrinsic-elements.ts',
        'src/utils/http-status.ts',
      ],
    },
    projects: [
      './runtime-tests/*/vitest.config.ts',
      {
        esbuild: {
          jsx: 'automatic',
          jsxImportSource: './src/jsx',
        },
        extends: true,
        test: {
          exclude: [...configDefaults.exclude, '**/sandbox/**', '**/*.case.test.*'],
          include: [
            'src/**/(*.)+(spec|test).+(ts|tsx|js)',
            'scripts/**/(*.)+(spec|test).+(ts|tsx|js)',
            'build/**/(*.)+(spec|test).+(ts|tsx|js)',
          ],
          name: 'main',
        },
      },
      {
        esbuild: {
          jsx: 'automatic',
          jsxImportSource: './src/jsx',
        },
        extends: true,
        test: {
          include: ['src/jsx/dom/**/(*.)+(spec|test).+(ts|tsx|js)', 'src/jsx/hooks/dom.test.tsx'],
          name: 'jsx-runtime-default',
        },
      },
      {
        esbuild: {
          jsx: 'automatic',
          jsxImportSource: './src/jsx/dom',
        },
        extends: true,
        test: {
          include: ['src/jsx/dom/**/(*.)+(spec|test).+(ts|tsx|js)', 'src/jsx/hooks/dom.test.tsx'],
          name: 'jsx-runtime-dom',
        },
      },
    ],
  },
})
