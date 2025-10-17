# Runtime Performance Optimization Guide

## Overview

Hono is an ultrafast web framework where runtime performance is a core value proposition. This guide helps you optimize request/response handling, router performance, middleware overhead, and JSX rendering.

## Quick Start: Profiling Runtime Performance

### 1. HTTP Performance Benchmarking

Use the existing HTTP benchmark suite to measure overall request throughput:

```bash
# Run HTTP benchmarks (requires bombardier)
cd benchmarks/http-server
bun run benchmark.ts
```

This compares main vs your branch and reports:
- Requests per second
- Latency (p50, p95, p99)
- Throughput comparisons

### 2. Router Benchmarks

Test router performance in isolation:

```bash
# Router comparison benchmarks
cd benchmarks/routers
bun run ./index.ts
```

Tests multiple routing patterns against competing routers (find-my-way, express, koa-router).

### 3. Custom Micro-Benchmarks

For targeted optimizations, use mitata for precise measurements:

```typescript
import { run, bench } from 'mitata'

// Example: Test a hot path optimization
bench('original implementation', () => {
  // Your current code
})

bench('optimized implementation', () => {
  // Your optimized code
})

await run()
```

## Common Optimization Targets

### Router Hot Path Optimization

**Goal:** Reduce time spent in route matching (core of every request)

**Measurement approach:**
1. Use router benchmarks with realistic route patterns
2. Focus on patterns users commonly deploy (params, wildcards)
3. Run 5-10 iterations, report median times

**Optimization techniques:**
- **Reduce allocations:** Object pooling for route params
- **Optimize regex:** Simplify patterns, avoid backtracking
- **Cache lookups:** Memoize frequently-matched routes
- **Algorithm improvements:** Better data structures (trie vs linear)

**Key files:**
- `src/router/reg-exp-router/router.ts` - Default router (RegExpRouter)
- `src/router/trie-router/router.ts` - Trie-based routing
- `src/router/smart-router/router.ts` - Adaptive router selection

**Example workflow:**
```bash
# 1. Baseline measurement
cd benchmarks/routers
bun run ./index.ts > baseline.txt

# 2. Make changes to router code

# 3. Rebuild
cd ../..
bun run build

# 4. Measure again
cd benchmarks/routers
bun run ./index.ts > optimized.txt

# 5. Compare results
diff baseline.txt optimized.txt
```

### Middleware Performance

**Goal:** Reduce overhead of middleware execution chains

**Common bottlenecks:**
- Middleware composition overhead
- Unnecessary work in middleware
- Poor ordering (expensive middleware run first)

**Optimization techniques:**
- **Lazy loading:** Import middleware only when used
- **Early returns:** Skip work when possible (e.g., CORS preflight)
- **Reduce closures:** Minimize allocations in hot paths
- **Optimize chains:** Order middleware by likelihood of early exit

**Measurement:**
```bash
# Create test app with middleware stack
# Use HTTP benchmarks to measure impact
cd benchmarks/http-server
# Edit server.ts to add/remove middleware
bun run benchmark.ts
```

### Request/Response Handling

**Goal:** Optimize Context object and header manipulation

**Hot paths to optimize:**
- Context creation (happens every request)
- Header parsing and setting
- Body parsing (JSON, FormData)
- Response generation

**Techniques:**
- **Object pooling:** Reuse Context objects
- **Avoid unnecessary parsing:** Lazy header access
- **Optimize common cases:** Fast path for simple JSON
- **Reduce string operations:** Buffer manipulation instead

**Key files:**
- `src/context.ts` - Context object
- `src/request.ts` - Request wrapper
- `src/utils/body.ts` - Body parsing utilities

### JSX Rendering Performance

**Goal:** Faster server-side rendering and streaming

**Measurement:**
```bash
cd benchmarks/jsx
bun run index.ts
```

**Optimization areas:**
- JSX-to-HTML transformation efficiency
- String concatenation vs streaming
- Component render overhead
- Memory allocations during rendering

**Key files:**
- `src/jsx/jsx-runtime.ts` - JSX runtime
- `src/jsx/streaming.ts` - Streaming JSX
- `src/middleware/jsx-renderer/` - JSX middleware

## Memory Optimization

### Profiling Memory Usage

Use Node.js or Bun profiling tools:

```bash
# Node.js heap snapshot
node --inspect build/profile-memory.js

# Bun memory profiling
bun --smol run your-test.ts
```

### Common Memory Issues

1. **Allocation churn:** Creating many short-lived objects
   - Solution: Object pooling, reuse
   
2. **Closure retention:** Accidental memory leaks
   - Solution: Careful closure usage, weak references
   
3. **Large buffers:** Body parsing allocations
   - Solution: Streaming, chunked processing

## Performance Testing Checklist

Before submitting a performance PR:

- [ ] Run HTTP benchmarks (main vs your branch)
- [ ] Run router benchmarks if router changed
- [ ] Test on multiple runtimes (Node, Bun, Deno) if applicable
- [ ] Measure with realistic workloads, not just synthetic
- [ ] Check memory usage hasn't increased significantly
- [ ] Verify tests still pass (`bun run test`)
- [ ] Document measurement methodology
- [ ] Report statistical confidence (multiple runs)

## Runtime-Specific Optimizations

### Cloudflare Workers

- Optimize cold start time (minimize imports)
- Reduce memory footprint (128MB limit common)
- Use Workers-specific APIs when beneficial

### Deno

- Leverage Deno-native APIs (Web Standards)
- Optimize for V8 JIT characteristics
- Consider TypeScript compilation overhead

### Bun

- Take advantage of JavaScriptCore optimizations
- Use Bun-native APIs where faster
- Test bundling impact on performance

### Node.js

- Support multiple Node versions (check CI config)
- Use Node-specific optimizations carefully (may not transfer)
- Consider async_hooks overhead

## Measurement Best Practices

### Statistical Rigor

- **Multiple runs:** Always run 5-10 iterations minimum
- **Warm up:** Discard first few runs (JIT warmup)
- **Report variance:** Include standard deviation or confidence intervals
- **Control environment:** Use CI runners for consistency
- **Isolate changes:** Test one optimization at a time

### Avoiding False Positives

- **Noise:** Network, disk I/O can create variance
- **JIT effects:** Microbenchmarks may not reflect real usage
- **Test data:** Use realistic payloads, not trivial examples
- **Regression testing:** Ensure no performance degradation elsewhere

### Documentation Standards

When reporting performance improvements:

```markdown
## Performance Impact

**Test Setup:**
- Hardware: GitHub Actions ubuntu-latest
- Runtime: Bun 1.2.19
- Benchmark: HTTP server (bombardier, 10s, 100 connections)

**Results:**
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Req/sec | 45,000 | 48,500 | +7.8% |
| p50 latency | 2.1ms | 1.9ms | -9.5% |
| p99 latency | 8.3ms | 7.6ms | -8.4% |

**Methodology:**
5 runs, median reported, first run discarded (warmup)
```

## Common Pitfalls

1. **Over-optimization:** Don't optimize until you measure
2. **Breaking changes:** Performance at cost of API stability
3. **Micro-optimizations:** Focus on hot paths, not rare code
4. **Readability trade-off:** Document complex optimizations
5. **False benchmarks:** Synthetic tests that don't reflect usage

## Resources

- [Mitata](https://github.com/evanw/esbuild/issues/1950) - Fast benchmarking library
- [Bombardier](https://github.com/codesenberg/bombardier) - HTTP load testing
- [V8 optimization tips](https://v8.dev/blog/elements-kinds)
- [Performance timing API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)

## Getting Help

- Check existing benchmarks in `benchmarks/` directory
- Review CI performance jobs in `.github/workflows/ci.yml`
- Search issues for "performance" label
- Ask in discussions for measurement advice
