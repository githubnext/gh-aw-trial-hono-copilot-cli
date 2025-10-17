# Build and Test Performance Optimization Guide

## Overview

Fast build and test cycles are critical for performance engineering velocity. This guide helps you optimize development workflows, CI performance, and test execution speed.

## Quick Performance Check

### Build Time Measurement

```bash
# Clean build timing
rm -rf dist
time bun run build

# Incremental build (with watch mode)
bun run watch
# (edit a file and observe rebuild time)
```

### Test Execution Timing

```bash
# All tests with timing
time bun run test

# Specific runtime tests
time bun run test:node
time bun run test:bun
time bun run test:deno
```

## Build Performance

### Current Build System

Hono uses esbuild via `build/build.ts`:
- Discovers entry points via glob (`src/**/*.ts`)
- Builds both ESM and CJS outputs
- Generates TypeScript declarations
- Validates package.json/jsr.json exports

### Build Optimization Strategies

#### 1. Parallel Builds

Current builds run sequentially. Consider parallelizing:

```typescript
// Instead of:
await cjsBuild()
await esmBuild()
await typesBuild()

// Try:
await Promise.all([
  cjsBuild(),
  esmBuild(),
  typesBuild()
])
```

**Measurement:**
```bash
# Before
time bun run build

# After changes
time bun run build

# Calculate improvement
```

#### 2. Incremental Type Checking

TypeScript declarations are regenerated fully each build. Options:
- Use `tsc --incremental` flag
- Skip type generation during development
- Separate type checking from build

```bash
# Fast build (no types) for iteration
bun ./build/build.ts --skip-types

# Full build for CI
bun run build
```

#### 3. Glob Optimization

Entry point discovery scans entire `src/` tree:

```typescript
// Current
const entryPoints = glob.sync('./src/**/*.ts', {
  ignore: ['./src/**/*.test.ts', ...]
})

// Potential optimization: cache results, use faster glob
```

#### 4. Build Caching

esbuild supports incremental builds:

```typescript
// Add to build options
{
  incremental: true,
  // Store build context for reuse
}
```

### Watch Mode Performance

For rapid iteration during perf work:

```bash
# Start watch mode
bun run watch

# In another terminal, make changes and test immediately
```

**Optimization tips:**
- Watch only changed files (not full rebuild)
- Skip unnecessary steps (linting, formatting)
- Use faster file watching (native OS events)

## Test Performance

### Test Suite Structure

Vitest with multiple projects:
- **main**: Core tests (Node.js)
- **bun**: Bun runtime tests
- **deno**: Deno runtime tests
- **fastly**: Fastly Compute tests
- **workerd**: Cloudflare Workers tests
- **lambda**: AWS Lambda tests
- **lambda-edge**: Lambda@Edge tests

### Test Optimization Strategies

#### 1. Parallel Test Execution

Vitest runs tests in parallel by default. Optimize with:

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    maxConcurrency: 10, // Tune based on CPU cores
    isolate: false, // Faster but less isolated
    pool: 'threads', // or 'forks' depending on tests
  }
})
```

**Measurement:**
```bash
# Baseline
time bun run test

# After config changes
time bun run test

# Check per-project timing
bun run test --reporter=verbose
```

#### 2. Test Filtering

Run only relevant tests during development:

```bash
# Single file
bun run test src/router/reg-exp-router/router.test.ts

# Pattern matching
bun run test --grep "router"

# Changed files only (with git)
bun run test --changed
```

#### 3. Test Setup Optimization

Common setup code runs for every test:

```typescript
// Expensive setup
beforeEach(async () => {
  // Optimize: Run once, reuse where safe
})

// Better for perf work
beforeAll(async () => {
  // Shared setup
})
```

#### 4. Skip Slow Tests During Iteration

```typescript
// Mark slow tests
it.skip('comprehensive integration test', () => {
  // Runs in CI, skipped during dev
})

// Or use test filtering
describe.skipIf(isDevelopment)('slow tests', () => {
  // ...
})
```

### Coverage Performance

Coverage generation is expensive. Disable during perf iteration:

```bash
# Fast testing (no coverage)
vitest --run --coverage=false

# Full test with coverage (for CI)
bun run test
```

## Type Checking Performance

### Current Type Checking

```bash
# Type check (no emit)
bun run test  # includes: tsc --noEmit
```

### Optimization Strategies

#### 1. Incremental Type Checking

```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

#### 2. Project References

For large codebases, split into projects:

```json
// tsconfig.json (root)
{
  "references": [
    { "path": "./src" },
    { "path": "./tests" }
  ]
}
```

Then: `tsc --build` for incremental builds

#### 3. Skip Lib Checking

```json
{
  "compilerOptions": {
    "skipLibCheck": true  // Faster, skips node_modules
  }
}
```

#### 4. Parallel Type Checking

Use faster type checkers for development:

```bash
# Standard tsc (slow but accurate)
tsc --noEmit

# Experimental: @typescript/native-preview (faster)
# Already in devDependencies, could be leveraged
```

## CI Performance Optimization

### Current CI Jobs (from .github/workflows/ci.yml)

12+ jobs running in parallel:
- Main (lint, format, build, test)
- Runtime tests (Node, Bun, Deno, Fastly, Workers, Lambda)
- Coverage aggregation
- Performance checks (bundle size, HTTP benchmark)

### Optimization Opportunities

#### 1. Dependency Caching

Already using actions/cache, but verify effectiveness:

```yaml
- uses: actions/cache@v3
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}
```

**Measurement:**
Check job logs for cache hit rates, restore times

#### 2. Job Parallelization

Current setup is good (parallel jobs). Could optimize:
- Combine related jobs (fewer queue times)
- Use matrices more aggressively
- Split long jobs into smaller parallel chunks

#### 3. Selective Job Execution

Skip jobs when irrelevant:

```yaml
# Only run Deno tests if Deno code changed
if: contains(github.event.head_commit.modified, 'deno')
```

Use path filters:

```yaml
paths-ignore:
  - 'docs/**'
  - '**.md'
```

#### 4. Faster Runners

Consider:
- GitHub larger runners (more CPU/memory)
- Self-hosted runners (if cost-effective)
- Specialized runners (with cached deps)

### Artifact Management

Coverage artifacts are uploaded/downloaded:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: coverage-main
    path: coverage/
```

**Optimization:**
- Compress artifacts (reduce upload/download time)
- Clean up old artifacts automatically
- Use artifact retention policies

## Development Workflow Optimization

### Fast Iteration Loop for Performance Work

```bash
# 1. Make code changes
vim src/router/reg-exp-router/router.ts

# 2. Quick rebuild (no types, no format)
bun ./build/build.ts

# 3. Run focused benchmark
cd benchmarks/routers
bun run ./index.ts

# 4. Iterate until improvement seen

# 5. Full validation
cd ../..
bun run build
bun run test
bun run lint
```

### Benchmark-Driven Development

For performance work, prioritize:

1. **Measure first** - Baseline current performance
2. **Change code** - Single targeted optimization
3. **Measure again** - Verify improvement
4. **Iterate** - Repeat until goal reached
5. **Validate** - Full test/lint/build

**Don't:**
- Make multiple changes at once (hard to isolate impact)
- Skip measurement (guessing doesn't work)
- Optimize without profiling (wrong target)

### Tools for Faster Iteration

#### 1. Nodemon/Watchman for Auto-Rebuild

```bash
# Install
bun add -d nodemon

# Watch and rebuild
nodemon --watch src --exec "bun run build"
```

#### 2. Benchmark Comparison Scripts

Create helper scripts:

```typescript
// compare-benchmark.ts
import { execSync } from 'child_process'

const runBenchmark = (branch: string) => {
  execSync(`git checkout ${branch}`)
  execSync('bun run build')
  return execSync('cd benchmarks/routers && bun run ./index.ts').toString()
}

const main = runBenchmark('main')
const pr = runBenchmark('perf/my-optimization')

console.log('Main:', main)
console.log('PR:', pr)
```

#### 3. Local CI Simulation

Test CI locally before pushing:

```bash
# Install act (GitHub Actions local runner)
# https://github.com/nektos/act

# Run main job locally
act -j main
```

## Performance Monitoring

### Build Time Tracking

Track build times over commits:

```bash
# Script to log build times
echo "$(date),$(git rev-parse HEAD),$(time bun run build 2>&1 | grep real)" >> build-times.log
```

### Test Time Tracking

Use Vitest reporters:

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: ['default', 'json'],
    outputFile: 'test-results.json'
  }
})
```

Parse JSON to track test duration trends.

## Troubleshooting Slow Builds/Tests

### Profiling Builds

```bash
# esbuild metafile
# Add to build.ts:
{
  metafile: true
}

# Then analyze
bun esbuild --metafile=meta.json --analyze
```

### Profiling Tests

```bash
# Vitest with CPU profiling
vitest --run --reporter=verbose --isolate

# Identify slow tests
# Look for tests taking >1s
```

### Common Bottlenecks

1. **Slow glob patterns** - Optimize entry point discovery
2. **Type generation** - Parallelize or skip during dev
3. **Test setup** - Reduce beforeEach work
4. **Serial operations** - Parallelize independent work
5. **Unoptimized CI** - Cache, filter, parallelize

## Checklist for Build/Test Performance PRs

- [ ] Measure baseline build time (clean + incremental)
- [ ] Measure baseline test time (full suite)
- [ ] Document optimization approach
- [ ] Measure improvement (include variance)
- [ ] Verify no tests broken
- [ ] Check CI impact (job duration)
- [ ] Validate on multiple platforms (if applicable)
- [ ] Document any trade-offs (complexity, maintainability)

## Resources

- [esbuild performance tips](https://esbuild.github.io/api/#performance)
- [Vitest performance](https://vitest.dev/guide/improving-performance.html)
- [TypeScript build performance](https://github.com/microsoft/TypeScript/wiki/Performance)
- [GitHub Actions optimization](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstrategy)
