# Framework Performance Patterns Guide

## Overview

Hono is designed for high performance across multiple JavaScript runtimes. This guide covers architectural patterns, common performance pitfalls, runtime-specific optimizations, and best practices for multi-runtime support.

## Core Performance Principles

### 1. Zero-Cost Abstractions

Hono aims for abstractions that compile away or have negligible runtime cost:

**Good:**
```typescript
// Middleware composition that doesn't add overhead
app.use(middleware1)
app.use(middleware2)
// Compiled into direct function calls, no extra layers
```

**Avoid:**
```typescript
// Unnecessary wrapper layers
app.use((c, next) => {
  return someWrapper(() => {
    return someOtherWrapper(() => {
      return actualMiddleware(c, next)
    })
  })
})
```

### 2. Pay-for-What-You-Use

Only include code that's actually needed:

```typescript
// Core import - minimal
import { Hono } from 'hono'

// Middleware is opt-in
import { jwt } from 'hono/jwt'
import { cors } from 'hono/cors'

// Tree-shaking eliminates unused middleware
```

### 3. Hot Path Optimization

Optimize code that runs on every request:

**Hot paths in Hono:**
- Router matching
- Context object creation
- Middleware execution chain
- Response generation

**Cold paths (less critical):**
- Application initialization
- Route registration
- Development-only utilities

Focus optimization effort on hot paths.

## Common Performance Anti-Patterns

### 1. Excessive Middleware Chains

**Problem:**
```typescript
app.use(logger())
app.use(timing())
app.use(cors())
app.use(csrf())
app.use(jwt())
app.use(compression())
// Every request pays overhead of ALL middleware
```

**Solution:**
```typescript
// Apply middleware only where needed
app.get('/api/*', jwt(), (c) => {
  // JWT only on API routes
})

app.post('/form', csrf(), (c) => {
  // CSRF only on form submissions
})
```

### 2. Synchronous Blocking Operations

**Problem:**
```typescript
app.get('/data', (c) => {
  const data = fs.readFileSync('./large-file.json')  // Blocks event loop
  return c.json(JSON.parse(data))
})
```

**Solution:**
```typescript
app.get('/data', async (c) => {
  const data = await Bun.file('./large-file.json').json()  // Non-blocking
  return c.json(data)
})
```

### 3. Unnecessary JSON Parsing/Stringification

**Problem:**
```typescript
app.post('/proxy', async (c) => {
  const body = await c.req.json()          // Parse
  const response = await fetch(url, {
    body: JSON.stringify(body)             // Re-stringify
  })
  return c.json(JSON.parse(await response.text()))  // Parse again!
})
```

**Solution:**
```typescript
app.post('/proxy', async (c) => {
  const body = await c.req.text()          // Keep as string
  const response = await fetch(url, {
    body: body                              // Pass through
  })
  return new Response(response.body)       // Stream through
})
```

### 4. Creating Functions in Hot Paths

**Problem:**
```typescript
app.get('/users/:id', (c) => {
  const userId = c.req.param('id')
  
  // New function created on every request!
  const fetchUser = () => {
    return db.query('SELECT * FROM users WHERE id = ?', userId)
  }
  
  return c.json(fetchUser())
})
```

**Solution:**
```typescript
// Define once, reuse
const fetchUser = (userId: string) => {
  return db.query('SELECT * FROM users WHERE id = ?', userId)
}

app.get('/users/:id', (c) => {
  const userId = c.req.param('id')
  return c.json(fetchUser(userId))
})
```

### 5. Large Object Creation

**Problem:**
```typescript
app.get('/status', (c) => {
  // Creates large object on every request
  return c.json({
    server: 'my-server',
    version: '1.0.0',
    capabilities: ['feature1', 'feature2', /* ... */],
    metadata: { /* large object */ }
  })
})
```

**Solution:**
```typescript
// Create once, reuse
const STATUS_RESPONSE = {
  server: 'my-server',
  version: '1.0.0',
  capabilities: ['feature1', 'feature2'],
  metadata: { /* ... */ }
}

app.get('/status', (c) => {
  return c.json(STATUS_RESPONSE)
})
```

## Runtime-Specific Optimizations

### Cloudflare Workers

**Environment characteristics:**
- V8 isolate per request
- Very fast cold starts (sub-millisecond)
- 128MB memory limit (common)
- Global state not shared between requests

**Optimization strategies:**

```typescript
// Good: Use Workers-specific APIs
import { Hono } from 'hono'

const app = new Hono()

export default {
  fetch: app.fetch  // Workers entry point
}

// Use Workers KV for caching
app.get('/cached', async (c) => {
  const cached = await c.env.MY_KV.get('key')
  if (cached) return c.json(JSON.parse(cached))
  
  const fresh = await fetchData()
  await c.env.MY_KV.put('key', JSON.stringify(fresh))
  return c.json(fresh)
})
```

**Avoid:**
- Large bundles (impacts startup time)
- In-memory caching (each request is isolated)
- Heavy computation (use Durable Objects or external services)

**Key optimizations:**
- Keep bundle size minimal (see bundle-size-optimization.md)
- Use Workers KV/R2 for storage
- Leverage edge caching (Cache API)
- Minimize imports (lazy load when possible)

### Deno

**Environment characteristics:**
- Modern runtime, Web Standards focus
- TypeScript native
- Secure by default (permissions)
- V8 engine

**Optimization strategies:**

```typescript
// Good: Use Deno-native APIs
import { Hono } from 'https://deno.land/x/hono/mod.ts'

const app = new Hono()

// Use Deno.serve (faster than HTTP server)
Deno.serve(app.fetch)

// Use Deno's fast File API
app.get('/file', async (c) => {
  const file = await Deno.readTextFile('./data.json')
  return c.json(JSON.parse(file))
})
```

**Avoid:**
- Node.js compatibility layers (slower)
- Unnecessary permissions (security overhead)
- npm: packages (prefer deno.land)

**Key optimizations:**
- Use Deno.serve() not polyfilled HTTP servers
- Leverage Deno's TypeScript caching
- Use Web Standards APIs (faster than compat layers)
- Enable unstable APIs for performance features

### Bun

**Environment characteristics:**
- JavaScriptCore (not V8)
- Extremely fast startup
- Fast file I/O and networking
- Node.js compatibility

**Optimization strategies:**

```typescript
// Good: Use Bun-optimized APIs
import { Hono } from 'hono'

const app = new Hono()

// Bun.serve is highly optimized
export default {
  port: 3000,
  fetch: app.fetch
}

// Use Bun.file (much faster than fs)
app.get('/file', async (c) => {
  const file = Bun.file('./data.json')
  return c.json(await file.json())
})
```

**Avoid:**
- Traditional Node.js fs operations
- Stream APIs where Bun.file suffices
- Polyfills for built-in functionality

**Key optimizations:**
- Use Bun.serve() native server
- Leverage Bun.file for file operations
- Use Bun's fast crypto primitives
- Take advantage of fast require/import

### Node.js

**Environment characteristics:**
- V8 engine
- Mature ecosystem
- Wide version support (18.18+)
- Libuv for I/O

**Optimization strategies:**

```typescript
// Good: Standard Node.js patterns
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

serve({
  fetch: app.fetch,
  port: 3000
})

// Use Node.js streams for large responses
app.get('/large', (c) => {
  const stream = fs.createReadStream('./large-file.txt')
  return c.body(stream)
})
```

**Avoid:**
- Blocking operations in event loop
- Excessive middleware (Node has more overhead than edge runtimes)
- Memory leaks (long-running processes)

**Key optimizations:**
- Use clustering for multi-core utilization
- Leverage Node's stream APIs
- Profile with --inspect for bottlenecks
- Use Node 20+ for performance improvements

### AWS Lambda / Serverless

**Environment characteristics:**
- Cold start penalty (first request)
- Warm instances reused
- Memory/CPU linked
- Time-limited execution

**Optimization strategies:**

```typescript
// Good: Minimize cold start impact
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'

// Initialize outside handler (runs once per cold start)
const app = new Hono()
const dbConnection = initDB()  // Reused across warm invocations

app.get('/api/users', async (c) => {
  // Use warm connection
  const users = await dbConnection.query('SELECT * FROM users')
  return c.json(users)
})

export const handler = handle(app)
```

**Avoid:**
- Initializing in handler (runs every request)
- Large dependencies (slow cold starts)
- Keeping connections open indefinitely

**Key optimizations:**
- Initialize once, outside handler
- Keep bundle size minimal
- Use Lambda layers for large dependencies
- Choose appropriate memory allocation (affects CPU)
- Keep functions warm with scheduled invocations

## Multi-Runtime Compatibility Patterns

### 1. Conditional Runtime Code

When runtime-specific optimization is needed:

```typescript
// Detect runtime
const isBun = typeof Bun !== 'undefined'
const isDeno = typeof Deno !== 'undefined'
const isCloudflare = typeof caches !== 'undefined' && typeof caches.default !== 'undefined'

// Use fastest implementation for each runtime
const readFile = isBun
  ? (path: string) => Bun.file(path).text()
  : isDeno
  ? (path: string) => Deno.readTextFile(path)
  : (path: string) => fs.promises.readFile(path, 'utf-8')
```

### 2. Web Standards First

Prefer Web Standards APIs (work everywhere):

```typescript
// Good: Web Standards
const data = await fetch(url)
const json = await data.json()

// Avoid: Runtime-specific unless necessary
const data = await Bun.fetch(url)  // Bun-only optimization
```

### 3. Graceful Degradation

Provide fallbacks:

```typescript
// Optimized path with fallback
const compress = typeof CompressionStream !== 'undefined'
  ? (data: string) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data))
          controller.close()
        }
      }).pipeThrough(new CompressionStream('gzip'))
      return stream
    }
  : (data: string) => {
      // Fallback: return uncompressed
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data))
          controller.close()
        }
      })
    }
```

## Performance Testing Across Runtimes

### Setup

Test your optimization on all supported runtimes:

```bash
# Node.js
node --version
bun run test:node

# Bun
bun --version
bun run test:bun

# Deno
deno --version
bun run test:deno

# Workers (via miniflare or wrangler dev)
npx wrangler dev
```

### Runtime Benchmark Comparison

```typescript
// benchmark-multi-runtime.ts
import { bench, run } from 'mitata'

bench('my optimization', () => {
  myOptimizedFunction()
})

await run()

// Run on each runtime
// bun run benchmark-multi-runtime.ts
// deno run benchmark-multi-runtime.ts
// node benchmark-multi-runtime.ts
```

Report results for all runtimes in PR.

## API Design for Performance

### 1. Lazy Initialization

```typescript
class Hono {
  private _router?: Router
  
  get router() {
    if (!this._router) {
      this._router = new RegExpRouter()
    }
    return this._router
  }
}
```

### 2. Method Chaining (Avoid Overhead)

```typescript
// Efficient chaining
app
  .get('/api/users', usersHandler)
  .post('/api/users', createUserHandler)
  .delete('/api/users/:id', deleteUserHandler)

// Each method returns `this`, no extra allocations
```

### 3. Optional Features

```typescript
// Make expensive features opt-in
app.use(logger())  // Opt-in logging
app.use(timing())  // Opt-in timing

// Don't:
// Built-in logging that can't be disabled
```

## Performance Debugging Techniques

### 1. Profiling

```bash
# Node.js CPU profiling
node --prof app.js
node --prof-process isolate-*.log > processed.txt

# Bun profiling
bun --inspect app.ts

# Deno profiling
deno run --inspect app.ts
```

### 2. Memory Profiling

```bash
# Node.js heap snapshot
node --inspect app.js
# Chrome DevTools -> Memory -> Take Snapshot

# Look for:
# - Memory leaks (growing heap)
# - Unexpected large objects
# - Retained closures
```

### 3. Flame Graphs

```bash
# Generate flame graph (Linux)
node --perf-basic-prof app.js
perf record -F 99 -p $(pgrep node) -g -- sleep 30
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

## Checklist for Performance-Focused API Design

- [ ] Hot paths have minimal overhead
- [ ] Optional features are opt-in (tree-shakeable)
- [ ] Avoid allocations in request handling
- [ ] Prefer Web Standards APIs
- [ ] Provide runtime-specific optimizations where beneficial
- [ ] Test across all supported runtimes
- [ ] Document performance characteristics
- [ ] Benchmark before and after

## Resources

- [V8 optimization tips](https://v8.dev/blog)
- [JavaScriptCore performance](https://webkit.org/blog/)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/platform/best-practices/)
- [Deno performance tips](https://deno.land/manual/runtime/performance)
- [Node.js performance](https://nodejs.org/en/docs/guides/simple-profiling/)

## Summary

Performance in a multi-runtime framework requires:
1. **Minimize overhead** in hot paths (router, middleware, context)
2. **Use Web Standards** for portability
3. **Optimize for each runtime** where it matters
4. **Test everywhere** before claiming performance improvements
5. **Document trade-offs** when optimization adds complexity
