# Bundle Size Optimization Guide for Hono

## Overview

This document provides a comprehensive guide for analyzing and optimizing Hono's bundle size. The goal is to maintain the "hono/tiny" preset under 12KB while reducing the overall bundle size by 5-10% (Performance Goal #4).

## Quick Start

### Running Bundle Analysis

```bash
# Build the project first
bun run build

# Run comprehensive bundle analysis
node scripts/analyze-bundle-size.js

# Check specific preset sizes
du -h dist/preset/tiny.js
du -h dist/preset/quick.js
```

### Key Metrics to Monitor

| Metric | Target | Current Status |
|--------|--------|----------------|
| hono/tiny preset | < 12 KB | Monitor in CI |
| Core bundle (index.js) | Minimize | Baseline TBD |
| Middleware (individual) | Tree-shakeable | Pay-per-use |
| Total dist size | Optimize | Track trend |

## Architecture for Bundle Optimization

### Current Structure

Hono's architecture is designed for bundle size optimization:

1. **Core Framework** (`src/hono-base.ts`, `src/context.ts`, `src/request.ts`)
   - Minimal core with essential functionality
   - ~2,500 lines of TypeScript (source)
   
2. **Router Implementations** (Multiple options for size/performance trade-offs)
   - `PatternRouter` - Used by tiny preset (smallest)
   - `LinearRouter` + `TrieRouter` + `SmartRouter` - Used by quick preset
   - `RegExpRouter` - Default, balanced performance
   
3. **Middleware** (25 separate modules, all optional)
   - Each middleware is a separate export path
   - Tree-shakeable - users only pay for what they import
   - Examples: `hono/jwt`, `hono/cors`, `hono/logger`
   
4. **Helpers** (14 modules, optional utilities)
   - Separate entry points
   - Examples: `hono/factory`, `hono/streaming`, `hono/ssg`

### Package.json Exports Strategy

```json
{
  "exports": {
    ".": "./dist/index.js",                          // Core only
    "./tiny": "./dist/preset/tiny.js",               // Minimal preset
    "./quick": "./dist/preset/quick.js",             // Fast preset
    "./jwt": "./dist/middleware/jwt/index.js",       // Opt-in middleware
    "./cors": "./dist/middleware/cors/index.js",     // Opt-in middleware
    // ... 20+ more middleware, all opt-in
  }
}
```

This design ensures:
- Users importing `hono` get only core functionality
- Middleware and helpers are completely opt-in
- Tree-shaking can eliminate unused code effectively

## Source Code Analysis

### Largest Source Files (Optimization Candidates)

Based on current codebase analysis:

```
 2370 lines  src/types.ts                        # Type definitions
  924 lines  src/jsx/intrinsic-elements.ts      # HTML element types
  794 lines  src/jsx/dom/render.ts               # JSX rendering
  763 lines  src/context.ts                      # Core Context class
  577 lines  src/adapter/aws-lambda/handler.ts   # AWS Lambda adapter
  531 lines  src/hono-base.ts                    # Core Hono class
  487 lines  src/request.ts                      # Request class
```

**Analysis:**
- `types.ts` (2370 lines): Type-only file, doesn't affect runtime bundle but impacts type-checking speed
- `jsx/intrinsic-elements.ts` (924 lines): HTML element type definitions, no runtime cost
- Core classes are reasonably sized (500-800 lines each)
- No obvious bloat in core framework

### Middleware Size Distribution

All middleware are kept as separate modules to enable tree-shaking:

```javascript
// User only imports what they need
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'         // Only JWT middleware bundled
import { cors } from 'hono/cors'       // Only CORS middleware bundled

// NOT imported = NOT bundled:
// - logger, etag, secure-headers, cache, compress, etc.
```

This architecture means bundle size optimizations should focus on:
1. **Core framework** (affects all users)
2. **Individual middleware** (affects only users of that middleware)
3. **Preset configurations** (tiny/quick presets)

## Optimization Strategies

### 1. Core Framework Optimization

**Target:** Minimize the baseline bundle that all users pay for.

**Techniques:**
- Ensure no middleware is accidentally included in core
- Avoid large dependencies or polyfills in core
- Use platform-native APIs where possible
- Keep Context and Request classes lean

**Verification:**
```bash
# Test that core import has minimal size
echo "import { Hono } from 'hono'; new Hono();" > test.js
esbuild test.js --bundle --minify --outfile=out.js
ls -lh out.js  # Should be minimal
```

### 2. Router Optimization

Routers have the biggest impact on preset sizes:

- **PatternRouter** (tiny preset): Smallest, O(n) lookup
- **RegExpRouter** (default): Balanced, good performance
- **LinearRouter + TrieRouter** (quick preset): Faster, larger bundle

**Optimization approach:**
- Keep router implementations focused and minimal
- Avoid unnecessary abstractions
- Share code between routers where possible

### 3. Middleware Code Splitting

Each middleware should be independently optimizable:

```typescript
// ✅ Good: Self-contained middleware
export const jwt = (options) => {
  return async (c, next) => {
    // Middleware logic
  }
}

// ❌ Bad: Middleware with heavy dependencies
import heavyLib from 'heavy-lib'  // 100KB dependency
export const myMiddleware = ...
```

**Best practices:**
- Minimal external dependencies
- Tree-shakeable internal imports
- Lazy initialization for heavy operations

### 4. Type Definition Optimization

While types don't affect runtime bundle, they impact:
- NPM package size
- Type-checking performance
- Developer experience

**Current state:**
- `types.ts`: 2,370 lines (consider splitting for IDE performance)
- `jsx/intrinsic-elements.ts`: 924 lines (HTML element types, hard to reduce)

**Recommendations:**
- Split large type files if IDE performance becomes an issue
- Use `export type` for type-only exports
- Avoid overly complex conditional types

### 5. Preset Optimization

**Tiny Preset** (`hono/tiny`):
```typescript
// Uses PatternRouter (smallest router)
import { HonoBase } from '../hono-base'
import { PatternRouter } from '../router/pattern-router'

export class Hono extends HonoBase {
  constructor(options = {}) {
    super(options)
    this.router = new PatternRouter()
  }
}
```

**Optimization opportunities:**
- Ensure PatternRouter is as small as possible
- Verify no unnecessary code in HonoBase
- Test tree-shaking effectiveness

**Quick Preset** (`hono/quick`):
```typescript
// Uses SmartRouter with LinearRouter + TrieRouter
import { SmartRouter } from '../router/smart-router'
import { LinearRouter } from '../router/linear-router'
import { TrieRouter } from '../router/trie-router'

export class Hono extends HonoBase {
  constructor(options = {}) {
    super(options)
    this.router = new SmartRouter({
      routers: [new LinearRouter(), new TrieRouter()],
    })
  }
}
```

**Trade-off:** Larger bundle for better routing performance.

## Measurement and Testing

### Automated Measurements (CI)

Hono uses octocov for bundle size tracking:

```yaml
# .github/workflows/ci.yml
- name: Performance Measures
  uses: ./.github/actions/perf-measures
```

This automatically:
- Builds main and PR branches
- Compares bundle sizes
- Posts results to PR comments
- Fails if bundle size increases significantly without justification

### Manual Measurement

```bash
# 1. Build project
bun run build

# 2. Run analysis tool
node scripts/analyze-bundle-size.js

# 3. Check specific files
ls -lh dist/preset/tiny.js
ls -lh dist/preset/quick.js
ls -lh dist/index.js

# 4. Compare branches
git checkout main && bun run build && du -b dist/preset/tiny.js > baseline.txt
git checkout perf/optimize && bun run build && du -b dist/preset/tiny.js > optimized.txt
paste baseline.txt optimized.txt | awk '{print "Saved:", $1 - $3, "bytes"}'
```

### esbuild Metafile Analysis

For detailed bundle composition analysis:

```bash
# Add metafile generation to build
# (Already included in build/build.ts)

# After building, analyze metafile
# Upload to: https://esbuild.github.io/analyze/
```

This shows:
- Which modules contribute most to bundle size
- Import relationships
- Code splitting effectiveness
- Tree-shaking results

### Tree-Shaking Verification

Test that unused exports are eliminated:

```bash
# Create test file with minimal import
echo "import { Hono } from 'hono'; const app = new Hono();" > test-treeshake.ts

# Bundle it
esbuild test-treeshake.ts --bundle --minify --metafile=meta.json --outfile=out.js

# Analyze meta.json - should NOT include:
# - Unused middleware
# - Unused helpers
# - Unused adapters
```

## Common Pitfalls

### 1. Accidental Middleware Import in Core

```typescript
// ❌ BAD: Middleware imported in core
// src/hono-base.ts
import { logger } from './middleware/logger'  // Now in every bundle!

// ✅ GOOD: Core stays clean
// Users import middleware separately
```

### 2. Large Dependencies

```typescript
// ❌ BAD: Heavy dependency for small feature
import _ from 'lodash'  // 70KB+ just for one helper

// ✅ GOOD: Native or minimal alternative
const result = array.map(x => x * 2)  // Native
```

### 3. Circular Dependencies

Can prevent tree-shaking and cause bundle bloat:

```typescript
// a.ts
import { b } from './b'

// b.ts  
import { a } from './a'  // ❌ Circular

// Fix: Refactor to eliminate cycle
```

### 4. Export Patterns that Hurt Tree-Shaking

```typescript
// ❌ BAD: Export * can bundle unused code
export * from './middleware'
export * from './helpers'

// ✅ GOOD: Named exports enable tree-shaking
export { jwt } from './middleware/jwt'
export { cors } from './middleware/cors'
```

## Optimization Checklist

Before submitting bundle size PRs:

- [ ] Baseline measurements documented (all affected exports)
- [ ] Optimization approach explained (what changed and why)
- [ ] Size reduction measured (bytes and percentage)
- [ ] Tree-shaking verified (test minimal imports)
- [ ] All tests passing (no functionality broken)
- [ ] All runtimes working (Node.js, Deno, Bun, Cloudflare Workers, etc.)
- [ ] Real-world testing (sample app bundle size)
- [ ] Trade-offs documented (if any complexity increased)
- [ ] CI bundle size check passing

## Performance vs Bundle Size Trade-offs

Some optimizations improve runtime performance at the cost of bundle size:

| Optimization | Runtime Impact | Bundle Impact | Recommendation |
|--------------|----------------|---------------|----------------|
| Router caching | +88% faster | +few bytes | ✅ Worth it |
| Set-based lookups | +20-80% faster | +few bytes | ✅ Worth it |
| Pre-parsed configs | +30-90% faster | +few bytes | ✅ Worth it |
| Additional router | +50% faster | +5-10 KB | ⚠️ Provide as option (quick preset) |

**Guideline:** Small bundle increases (<1%) are acceptable for significant performance gains (>20%).

## Target Benchmarks

Based on Goal #4 (5-10% bundle size reduction):

### Current Baseline (Needs Measurement)

```bash
bun run build
node scripts/analyze-bundle-size.js
# Document current sizes here
```

### Target (5-10% Reduction)

After optimization:
- Core exports: 5-10% smaller
- Preset/tiny: Stay under 12 KB (already optimized)
- Middleware: Individually optimize high-usage middleware

## Resources

- [esbuild tree-shaking](https://esbuild.github.io/api/#tree-shaking)
- [esbuild bundle analyzer](https://esbuild.github.io/analyze/)
- [Bundle size limits for edge platforms](https://developers.cloudflare.com/workers/platform/limits/)
- [Why bundle size matters](https://web.dev/reduce-javascript-payloads-with-code-splitting/)
- [Analyzing bundle size with bundlephobia](https://bundlephobia.com/)

## Next Steps

1. **Establish baseline:** Run analysis tool after merging recent optimizations
2. **Identify targets:** Find areas contributing most to bundle size
3. **Optimize incrementally:** Small, focused PRs with clear measurements
4. **Monitor continuously:** CI checks prevent regressions
5. **Document learnings:** Update this guide with findings

---

**Last Updated:** 2025-10-17  
**Related:** Performance Goal #4, `.github/copilot/instructions/bundle-size-optimization.md`
