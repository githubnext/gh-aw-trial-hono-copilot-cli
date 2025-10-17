# Bundle Size Optimization Guide

## Overview

Hono advertises "hono/tiny" as under 12kB. Bundle size directly impacts edge runtime deployments, serverless cold starts, and user bundle sizes. This guide helps you maintain and reduce bundle size.

## Quick Bundle Size Check

### Current Bundle Size Monitoring

Hono uses octocov for automated bundle size tracking:

```bash
# Bundle size is checked automatically in CI
# See: .github/workflows/ci.yml - perf-measures-check-on-pr
```

View current metrics:
```bash
# Build and check size
bun run build
du -sh dist/

# Check specific presets
du -h dist/preset/tiny.js
du -h dist/preset/quick.js
```

### Manual Bundle Analysis

```bash
# Install size analysis tools
bun add -d esbuild-visualizer

# Analyze a build
esbuild src/preset/tiny.ts --bundle --minify --metafile=meta.json
# View meta.json in https://esbuild.github.io/analyze/
```

## Bundle Size Targets

From research and package.json:
- **hono/tiny**: ~12kB (advertised limit)
- **hono core**: Minimize baseline
- **middleware**: Tree-shakeable, pay-per-use
- **routers**: Alternative routers for size-conscious users

## Optimization Strategies

### 1. Tree-Shaking Optimization

Ensure all exports are tree-shakeable:

**Good (tree-shakeable):**
```typescript
// Named exports
export { Router } from './router'
export { Context } from './context'

// User imports only what they need
import { Router } from 'hono'
```

**Bad (not tree-shakeable):**
```typescript
// Side-effects or default exports with dependencies
export default new PluginManager()
```

**Verification:**
```bash
# Check if unused code is eliminated
esbuild test-import.ts --bundle --minify --metafile=meta.json
# Examine meta.json - unused modules should be absent
```

### 2. Code Splitting

Keep optional features separate:

```typescript
// Core in main bundle
export { Hono } from './hono'

// Middleware as separate entries
export { jwt } from './middleware/jwt'  // Not in core
```

**Package.json exports strategy:**
```json
{
  "exports": {
    ".": "./dist/index.js",           // Core only
    "./jwt": "./dist/middleware/jwt/index.js"  // Opt-in
  }
}
```

### 3. Reduce Dependencies

Check for unnecessary dependencies:

```bash
# Analyze what's being bundled
bun add -d @vercel/nft
node -e "require('@vercel/nft').nodeFileTrace(['dist/preset/tiny.js'])"
```

**Common culprits:**
- Large utility libraries (use smaller alternatives)
- Polyfills (leverage platform APIs)
- Development-only code in production builds

### 4. Minification Optimization

esbuild minification is already used, but verify:

```typescript
// build/build.ts
{
  minify: true,          // ✓ Already enabled
  treeShaking: true,     // ✓ Enabled by default
  format: 'esm',         // ✓ Better for tree-shaking
}
```

Advanced: Test with terser for additional savings:

```bash
# Compare minifiers
esbuild src/index.ts --bundle --minify --outfile=dist/esbuild.js
terser dist/esbuild.js -c -m -o dist/terser.js

ls -lh dist/*.js
```

### 5. Remove Dead Code

Common dead code patterns:

```typescript
// Development-only code (should be stripped)
if (process.env.NODE_ENV === 'development') {
  // This should be eliminated in production builds
}

// Unreachable code
function deprecated() {
  throw new Error('Use newFunction instead')
  // Anything after throw is dead
}
```

**Verification:**
Search for `NODE_ENV` checks and ensure build removes them:

```bash
# Should not contain "development" string
grep -r "development" dist/preset/tiny.js
```

### 6. Optimize Type Definitions

TypeScript `.d.ts` files don't affect runtime bundle but impact:
- Type checking speed
- IDE autocomplete performance
- NPM package size

**Optimization:**
- Use `export type` for types (not re-exported at runtime)
- Avoid complex conditional types when simpler suffices
- Split large type files

### 7. Regular Expression Optimization

Routers use regex heavily. Optimize patterns:

```typescript
// Before: Complex regex with many captures
const pattern = /^\/([^/]+)\/([^/]+)\/([^/]+)$/

// After: Simpler pattern, manual parsing if needed
const pattern = /^\/[^/]+\/[^/]+\/[^/]+$/
```

Regex code in JS bundles can be large. Simplify where possible.

### 8. Lazy Initialization

Delay expensive initialization until needed:

```typescript
// Before: Eager initialization
const complexRouter = new ComplexRouter()

// After: Lazy initialization
let complexRouter: ComplexRouter | null = null
function getRouter() {
  if (!complexRouter) {
    complexRouter = new ComplexRouter()
  }
  return complexRouter
}
```

## Bundle Size Measurement

### Automated Measurement (CI)

CI automatically measures bundle size changes in PRs:

```yaml
# .github/workflows/ci.yml
- uses: ./.github/actions/perf-measures
```

This uses `perf-measures/` scripts to:
1. Build main and PR branches
2. Compare bundle sizes
3. Post results to PR comments

### Manual Measurement

```bash
# 1. Checkout baseline
git checkout main
bun run build
du -b dist/preset/tiny.js > baseline-size.txt

# 2. Checkout your branch
git checkout perf/reduce-bundle-size
bun run build
du -b dist/preset/tiny.js > optimized-size.txt

# 3. Compare
paste baseline-size.txt optimized-size.txt | awk '{print "Change:", $1 - $3, "bytes"}'
```

### Size Budget Enforcement

Consider adding size budgets:

```typescript
// build/build.ts - Add size checks
const maxSizes = {
  'dist/preset/tiny.js': 12 * 1024,  // 12KB
  'dist/index.js': 50 * 1024,        // 50KB
}

Object.entries(maxSizes).forEach(([file, maxSize]) => {
  const actual = fs.statSync(file).size
  if (actual > maxSize) {
    throw new Error(`${file} exceeds budget: ${actual} > ${maxSize}`)
  }
})
```

## Analysis Tools

### 1. esbuild Metafile Analysis

```typescript
// Add to build options
{
  metafile: true,
  outfile: 'dist/bundle.js'
}

// Then analyze
await build.metafile
fs.writeFileSync('meta.json', JSON.stringify(build.metafile))
```

Upload meta.json to https://esbuild.github.io/analyze/

### 2. Source Map Explorer

```bash
bun add -d source-map-explorer

# Generate source maps
esbuild src/preset/tiny.ts --bundle --minify --sourcemap --outfile=dist/tiny.js

# Analyze
source-map-explorer dist/tiny.js
```

### 3. Webpack Bundle Analyzer (if using webpack)

```bash
bun add -d webpack-bundle-analyzer

# Generate stats
webpack --profile --json > stats.json

# Visualize
webpack-bundle-analyzer stats.json
```

## Optimization Checklist

Before submitting bundle size PRs:

- [ ] Measure baseline bundle size (all key exports)
- [ ] Document optimization approach
- [ ] Measure size reduction (bytes and %)
- [ ] Verify tree-shaking still works (test imports)
- [ ] Check no functionality broken (run tests)
- [ ] Verify all runtimes still supported
- [ ] Test bundle in real-world scenario (sample app)
- [ ] Document any trade-offs (code complexity, features)

## Common Bundle Size Pitfalls

### 1. Accidental Includes

```typescript
// Accidentally imports entire lodash
import _ from 'lodash'

// Better: Import only what you need
import map from 'lodash/map'

// Best: Use native or smaller alternative
array.map(...)
```

### 2. Circular Dependencies

Can prevent tree-shaking:

```typescript
// a.ts
import { b } from './b'
export const a = b + 1

// b.ts
import { a } from './a'
export const b = a + 1

// This circular dependency prevents optimization
```

Fix: Refactor to eliminate cycles

### 3. Re-exporting Everything

```typescript
// index.ts - exports everything from all modules
export * from './router'
export * from './middleware'
export * from './utils'

// User imports one thing, but bundler sees all exports
import { Router } from 'hono'
```

Better: Explicit exports, encouraging tree-shaking

### 4. Dynamic Imports Not Used

Dynamic imports enable code splitting:

```typescript
// Static import - always bundled
import { heavy } from './heavy-feature'

// Dynamic import - loaded on demand (where supported)
const { heavy } = await import('./heavy-feature')
```

Consider for rarely-used features.

### 5. Large Constant Data

```typescript
// Avoid large embedded data structures
const largeTable = [/* 10KB of data */]

// Better: Generate at runtime or lazy-load
const largeTable = generateTable()
```

## Bundle Size Impact on Performance

### Edge Runtime Constraints

Cloudflare Workers: 1MB limit (after compression)
- Stay well under limit for headroom
- Smaller bundles = faster worker startup

### Cold Start Performance

Serverless platforms (Lambda, Vercel):
- Larger bundles = slower cold starts
- More code to parse and compile
- Optimization: Keep bundles minimal

### User Bundle Size

When Hono is bundled in client-side code:
- Smaller Hono = smaller user apps
- Important for mobile users (slow networks)
- Better lighthouse scores

## Reporting Bundle Size Improvements

Include in PR description:

```markdown
## Bundle Size Impact

**Methodology:**
- Built with `bun run build`
- Measured minified size (no gzip)
- Compared main vs this branch

**Results:**

| Export | Before | After | Change |
|--------|--------|-------|--------|
| hono/tiny | 12,045 bytes | 11,234 bytes | -811 bytes (-6.7%) |
| hono core | 48,521 bytes | 47,105 bytes | -1,416 bytes (-2.9%) |

**Verification:**
- Tree-shaking tested: ✓ (sample app bundle unchanged)
- All runtimes passing: ✓
- No features removed: ✓
```

## Resources

- [esbuild tree-shaking](https://esbuild.github.io/api/#tree-shaking)
- [Bundle size limits for edge platforms](https://developers.cloudflare.com/workers/platform/limits/)
- [Why bundle size matters](https://web.dev/reduce-javascript-payloads-with-code-splitting/)
- [Analyzing bundle size](https://bundlephobia.com/)

## Maintenance

Bundle size should be monitored continuously:
- CI checks prevent regressions
- Regular audits identify opportunities
- New features must justify size cost
- Consider size when reviewing PRs
