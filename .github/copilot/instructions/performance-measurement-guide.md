# Performance Measurement and Benchmarking Guide

## Overview

Accurate performance measurement is the foundation of optimization work. This guide covers Hono's existing benchmark infrastructure, how to create new benchmarks, and best practices for reliable measurements.

## Existing Benchmark Infrastructure

### 1. HTTP Server Benchmarks

**Location:** `benchmarks/http-server/`

**Purpose:** Measure overall request/response performance

**Tools:** Bombardier (HTTP load generator)

**Usage:**
```bash
cd benchmarks/http-server
bun run benchmark.ts
```

**What it measures:**
- Requests per second
- Latency distribution (p50, p95, p99)
- Main branch vs current branch comparison

**When to use:**
- Testing request handling optimizations
- Validating middleware performance
- Measuring overall application throughput

### 2. Router Benchmarks

**Location:** `benchmarks/routers/`

**Purpose:** Compare Hono routers against competitors

**Tools:** Mitata (precise JS benchmarking)

**Usage:**
```bash
cd benchmarks/routers
bun run ./index.ts
```

**What it measures:**
- Route matching speed for various patterns
- Comparison with express, koa-router, find-my-way, etc.
- Different routing scenarios (static, params, wildcards)

**When to use:**
- Optimizing router algorithms
- Comparing router implementations
- Validating route matching performance

### 3. JSX Benchmarks

**Location:** `benchmarks/jsx/`

**Purpose:** Compare JSX rendering implementations

**Usage:**
```bash
cd benchmarks/jsx
bun run index.ts
```

**What it measures:**
- JSX-to-HTML rendering speed
- Comparison with React, Preact, nano-jsx

**When to use:**
- Optimizing JSX rendering
- Comparing JSX runtime implementations

### 4. Bundle Size & Type Check (Automated)

**Location:** `.github/actions/perf-measures/`

**Purpose:** Track bundle size and type checking performance over time

**Tools:** Octocov, tsc, typescript-go

**Automation:** Runs on every PR via CI

**What it measures:**
- Bundle size for core and presets
- TypeScript compilation time
- Type checking performance with large apps (200 routes)

**When to use:**
- Already automated, just observe results in PRs
- Review historical trends via octocov reports

## Creating New Benchmarks

### When to Create a Benchmark

Create a new benchmark when:
- Optimizing a specific code path not covered by existing benchmarks
- Need to validate a performance hypothesis
- Measuring performance impact of a new feature
- Comparing alternative implementations

**Don't create a benchmark for:**
- One-time measurements (use temporary scripts)
- Functionality already covered by existing benchmarks
- Micro-optimizations without measurable impact

### Benchmark Template (Mitata)

Mitata is used throughout Hono for JavaScript benchmarking:

```typescript
// benchmarks/my-feature/index.ts
import { run, bench, group } from 'mitata'

// Setup (outside measurement)
const testData = generateTestData()

// Basic benchmark
bench('my feature', () => {
  myFeature(testData)
})

// Comparative benchmarks
group('comparison', () => {
  bench('current implementation', () => {
    currentImpl(testData)
  })
  
  bench('optimized implementation', () => {
    optimizedImpl(testData)
  })
})

// Run benchmarks
await run()
```

**Output interpretation:**
```
my feature        x 1,234,567 ops/sec ±0.5% (95 runs sampled)
comparison/current   x 890,000 ops/sec ±0.3% (96 runs sampled)
comparison/optimized x 1,100,000 ops/sec ±0.4% (97 runs sampled)
                     23.6% faster
```

### HTTP Benchmark Template (Bombardier)

For end-to-end HTTP testing:

```typescript
// benchmarks/my-http-test/server.ts
import { Hono } from '../../dist/index.js'

const app = new Hono()

app.get('/test', (c) => {
  return c.json({ message: 'Hello' })
})

export default app
```

```typescript
// benchmarks/my-http-test/benchmark.ts
import { $ } from 'bun'

// Start server
const server = Bun.serve({
  port: 3000,
  fetch: app.fetch
})

// Run bombardier
await $`bombardier -c 100 -d 10s http://localhost:3000/test`

// Stop server
server.stop()
```

**Bombardier options:**
- `-c 100`: 100 concurrent connections
- `-d 10s`: 10-second duration
- `-l`: Latency statistics
- `-p r`: Print results in machine-readable format

### Memory Benchmark Template

For memory usage testing:

```typescript
// benchmarks/memory/measure.ts
const baseline = process.memoryUsage().heapUsed

// Code to measure
for (let i = 0; i < 10000; i++) {
  myFunction()
}

const afterRun = process.memoryUsage().heapUsed
const delta = afterRun - baseline

console.log(`Memory increase: ${delta / 1024 / 1024} MB`)

// Force GC (requires --expose-gc flag)
if (global.gc) {
  global.gc()
  const afterGC = process.memoryUsage().heapUsed
  console.log(`After GC: ${afterGC / 1024 / 1024} MB`)
}
```

## Benchmark Best Practices

### 1. Isolate What You're Measuring

**Good:**
```typescript
// Measure only the target function
const testData = prepareData()  // Outside measurement

bench('target function', () => {
  targetFunction(testData)  // Only this is measured
})
```

**Bad:**
```typescript
bench('target function', () => {
  const testData = prepareData()  // Also measures setup!
  targetFunction(testData)
})
```

### 2. Use Realistic Test Data

**Good:**
```typescript
// Realistic HTTP request
const req = new Request('http://localhost:3000/users/123/posts/456', {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ...'
  }
})
```

**Bad:**
```typescript
// Trivial test case
const req = new Request('http://localhost/')
```

### 3. Warm Up Before Measuring

JavaScript JIT compilers need warmup:

```typescript
// Warm up (not measured)
for (let i = 0; i < 1000; i++) {
  myFunction()
}

// Now measure (JIT optimized)
bench('my function', () => {
  myFunction()
})
```

Mitata handles warmup automatically, but be aware for custom benchmarks.

### 4. Run Multiple Iterations

Always run benchmarks multiple times:

```typescript
const results = []
for (let run = 0; run < 5; run++) {
  const result = await runBenchmark()
  results.push(result)
}

// Report median (more robust than mean)
const median = results.sort()[Math.floor(results.length / 2)]
console.log(`Median: ${median}`)
```

### 5. Control the Environment

**Consistent environment:**
- Same hardware (use CI runners for consistency)
- No other processes running
- Consistent Node/Bun/Deno versions
- Disable frequency scaling (if possible)

**CI considerations:**
- GitHub Actions runners have variable performance
- Run multiple times, report median
- Accept some variance as unavoidable

### 6. Statistical Significance

Report confidence intervals:

```typescript
import { mean, standardDeviation } from 'simple-statistics'

const results = [/* multiple runs */]
const avg = mean(results)
const stdDev = standardDeviation(results)
const confidenceInterval = 1.96 * stdDev / Math.sqrt(results.length)

console.log(`${avg} ±${confidenceInterval} (95% CI)`)
```

## Interpreting Benchmark Results

### Understanding Variance

Benchmarks always have variance:
- **<5% variance**: Excellent, very stable
- **5-10% variance**: Good, acceptable
- **10-20% variance**: Moderate, consider more runs
- **>20% variance**: High, environment or benchmark issues

### Determining Significance

A performance improvement is significant if:
1. **Magnitude**: >5% improvement (smaller may be noise)
2. **Consistency**: Improvement seen across multiple runs
3. **Real-world impact**: Measurable in end-to-end benchmarks

**Example:**
```
Before: 45,000 req/sec ±2%
After:  48,000 req/sec ±2%
Improvement: 6.7%
Conclusion: Significant improvement ✓
```

### Avoiding False Positives

Common causes of false positives:
- **JIT warmup differences**: Ensure equal warmup
- **GC timing**: Garbage collection during measurement
- **Thermal throttling**: CPU overheating in long runs
- **Background processes**: Other apps consuming resources

**Mitigation:**
- Run longer benchmarks (>10s)
- Multiple iterations
- Use median instead of mean
- Compare on CI (more consistent)

## Integration with CI

### Automated Performance Checks

Hono's CI automatically runs performance checks on PRs:

```yaml
# .github/workflows/ci.yml
http-benchmark-on-pr:
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4
    - run: bun run benchmark.ts
```

**What happens:**
1. Checkout main branch, run benchmark
2. Checkout PR branch, run benchmark
3. Compare results, post to PR comments

### Adding New Benchmarks to CI

To add your benchmark to CI:

```yaml
- name: Run my benchmark
  run: |
    cd benchmarks/my-benchmark
    bun run ./index.ts > results.txt
    
- name: Comment PR
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const results = fs.readFileSync('benchmarks/my-benchmark/results.txt', 'utf8');
      await github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `## My Benchmark Results\n\n${results}`
      });
```

## Troubleshooting Benchmarks

### Benchmark Too Slow

If benchmark takes too long:
- Reduce iterations (but keep enough for accuracy)
- Use smaller test datasets
- Profile to find bottlenecks in benchmark itself

### Inconsistent Results

If results vary widely:
- Check for external factors (CPU throttling, background apps)
- Increase warmup iterations
- Run on CI for consistency
- Use longer benchmark duration

### No Measurable Difference

If optimization shows no improvement:
- Verify optimization is in the hot path
- Check if optimization is actually applied (build correctly?)
- Benchmark may not exercise optimized code
- Improvement may be too small (<1%)

## Benchmark Maintenance

### Review Existing Benchmarks

Periodically review benchmarks for:
- Outdated test scenarios
- No longer relevant comparisons
- Broken benchmarks (dependencies, APIs changed)

### Update Benchmarks

When APIs change:
- Update benchmarks to use new APIs
- Keep old benchmarks for historical comparison
- Document breaking changes in benchmark results

### Deprecate Obsolete Benchmarks

Remove benchmarks that:
- Test removed features
- Are superseded by better benchmarks
- No longer provide value

## Performance Regression Detection

### Baseline Storage

Store baseline performance metrics:

```bash
# Store baseline
bun run benchmark > baseline-$(git rev-parse HEAD).txt

# Compare later
diff baseline-abc123.txt current-results.txt
```

### Automated Regression Detection

CI can detect regressions:

```typescript
// compare-performance.ts
const baseline = parseResults('baseline.txt')
const current = parseResults('current.txt')

const regression = current.opsPerSec < baseline.opsPerSec * 0.95  // 5% threshold

if (regression) {
  throw new Error('Performance regression detected!')
}
```

## Resources

- [Mitata documentation](https://github.com/evanw/esbuild/issues/1950)
- [Bombardier](https://github.com/codesenberg/bombardier)
- [V8 benchmarking tips](https://v8.dev/blog/real-world-performance)
- [Reliable benchmarking](https://benchmarksgame-team.pages.debian.net/benchmarksgame/how-programs-are-measured.html)

## Summary Checklist

When creating or running benchmarks:

- [ ] Choose appropriate benchmark type (HTTP, router, micro)
- [ ] Use realistic test data
- [ ] Ensure proper warmup
- [ ] Run multiple iterations (5-10 minimum)
- [ ] Report median and variance
- [ ] Control environment (use CI)
- [ ] Document methodology
- [ ] Interpret results conservatively (avoid false positives)
- [ ] Consider adding to CI if valuable
