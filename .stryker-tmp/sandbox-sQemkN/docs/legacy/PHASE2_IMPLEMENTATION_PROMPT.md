<!-- markdownlint-disable -->
# Task: Implement Phase 2 - Performance & Scalability Improvements

## Context

You are continuing work on a Node.js/React portfolio management application. **Phase 1 (Documentation & Security) is complete**. Phase 2 focuses on performance optimization and scalability improvements identified in the comprehensive audit (comprehensive_audit_v3.md).

**Phase 1 Accomplishments:**
- ✅ Enhanced user guide
- ✅ API key strength enforcement
- ✅ Security audit logging
- ✅ Environment template

**Phase 2 Goals:**
- Improve response times by 80%
- Reduce external API calls by 95%
- Decrease bundle size by 30%
- Enhance security with progressive lockout
- Increase test coverage for UI components

---

## Objectives (in priority order)

### Phase 2: Performance & Scalability (Month 1)
**Priority**: HIGH | **Estimated Effort**: 14 hours

Implement these 5 items:

---

## Item 1: Price Data Caching (3 hours)

### Priority: 🔴 CRITICAL
**Impact**: 95% reduction in external API calls, 80% faster price requests

### Current Problem

Every price request hits the external Stooq API:
- Slow response times (~1-3 seconds)
- Unnecessary API calls for repeated requests
- Risk of hitting rate limits
- Poor user experience

### Requirements

Implement in-memory caching with TTL for price data.

#### Implementation Details

**File**: `server/cache/priceCache.js` (NEW)

Create a dedicated caching module:

```javascript
import NodeCache from 'node-cache';
import crypto from 'crypto';

// Already installed: node-cache
const priceCache = new NodeCache({
  stdTTL: 600,        // 10 minutes default
  checkperiod: 120,   // Check for expired keys every 2 min
  useClones: false    // Better performance
});

export function getCachedPrice(symbol, range) {
  const key = `${symbol}:${range}`;
  return priceCache.get(key);
}

export function setCachedPrice(symbol, range, data) {
  const key = `${symbol}:${range}`;
  const etag = generateETag(data);
  
  priceCache.set(key, {
    data,
    etag,
    timestamp: Date.now()
  });
  
  return etag;
}

export function generateETag(data) {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
}

export function getCacheStats() {
  return {
    keys: priceCache.keys().length,
    hits: priceCache.getStats().hits,
    misses: priceCache.getStats().misses,
    hitRate: calculateHitRate()
  };
}

function calculateHitRate() {
  const stats = priceCache.getStats();
  const total = stats.hits + stats.misses;
  return total > 0 ? (stats.hits / total * 100).toFixed(2) : 0;
}
```

**File**: `server/app.js` (MODIFY)

Update the `/api/prices/:symbol` endpoint:

```javascript
import { getCachedPrice, setCachedPrice, getCacheStats } from './cache/priceCache.js';

app.get('/api/prices/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { range = '1y' } = req.query;
  
  // Check cache first
  const cached = getCachedPrice(symbol, range);
  
  if (cached) {
    // Support conditional requests
    const clientETag = req.get('If-None-Match');
    
    if (clientETag === cached.etag) {
      return res.status(304).end();
    }
    
    // Cache hit - return cached data
    return res
      .set('ETag', cached.etag)
      .set('Cache-Control', 'private, max-age=600')
      .set('X-Cache', 'HIT')
      .json(cached.data);
  }
  
  // Cache miss - fetch from API
  try {
    const data = await fetchFromStooq(symbol, range);
    const etag = setCachedPrice(symbol, range, data);
    
    res
      .set('ETag', etag)
      .set('Cache-Control', 'private, max-age=600')
      .set('X-Cache', 'MISS')
      .json(data);
  } catch (error) {
    req.log.error({ error, symbol, range }, 'Price fetch failed');
    res.status(500).json({ error: 'PRICE_FETCH_FAILED' });
  }
});

// Add cache stats endpoint
app.get('/api/cache/stats', (req, res) => {
  res.json(getCacheStats());
});
```

#### Environment Variables

Add to `.env.example`:

```bash
# Cache Configuration
PRICE_CACHE_TTL_SECONDS=600    # 10 minutes
PRICE_CACHE_CHECK_PERIOD=120   # 2 minutes
```

#### Testing Requirements

**File**: `server/__tests__/priceCache.test.js` (NEW)

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCachedPrice, setCachedPrice, generateETag } from '../cache/priceCache.js';

test('caches price data', () => {
  const data = [{ date: '2024-01-01', close: 100 }];
  const etag = setCachedPrice('AAPL', '1y', data);
  
  const cached = getCachedPrice('AAPL', '1y');
  
  assert.ok(cached);
  assert.deepEqual(cached.data, data);
  assert.equal(cached.etag, etag);
});

test('returns undefined for cache miss', () => {
  const cached = getCachedPrice('NONEXISTENT', '1y');
  assert.equal(cached, undefined);
});

test('generates consistent ETags', () => {
  const data = [{ date: '2024-01-01', close: 100 }];
  const etag1 = generateETag(data);
  const etag2 = generateETag(data);
  
  assert.equal(etag1, etag2);
});

test('respects TTL expiration', async () => {
  // Test with very short TTL
  // Implementation detail
});
```

**File**: `server/__tests__/api_cache.test.js` (NEW)

Integration test for the endpoint:

```javascript
test('returns cached price on second request', async () => {
  const app = createApp();
  
  // First request - cache miss
  const res1 = await request(app)
    .get('/api/prices/AAPL?range=1y');
  
  assert.equal(res1.status, 200);
  assert.equal(res1.headers['x-cache'], 'MISS');
  const etag = res1.headers['etag'];
  
  // Second request - cache hit
  const res2 = await request(app)
    .get('/api/prices/AAPL?range=1y');
  
  assert.equal(res2.status, 200);
  assert.equal(res2.headers['x-cache'], 'HIT');
  assert.equal(res2.headers['etag'], etag);
});

test('supports conditional requests', async () => {
  const app = createApp();
  
  const res1 = await request(app)
    .get('/api/prices/AAPL?range=1y');
  
  const etag = res1.headers['etag'];
  
  // Request with If-None-Match
  const res2 = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('If-None-Match', etag);
  
  assert.equal(res2.status, 304);
});
```

#### Success Criteria

- [ ] Cache module created with get/set/stats functions
- [ ] Prices endpoint integrated with cache
- [ ] ETag support for conditional requests
- [ ] X-Cache header shows HIT/MISS
- [ ] Cache stats endpoint works
- [ ] TTL configurable via environment
- [ ] All tests pass
- [ ] Cache hit rate >80% after warm-up

#### Expected Performance Impact

**Before:**
- Average response time: 1,000-3,000ms
- External API calls: 100%
- User experience: Slow

**After:**
- Average response time: 50-200ms (80% improvement)
- External API calls: <5% (95% reduction)
- User experience: Fast, responsive

---

## Item 2: Enhanced Brute Force Protection (3 hours)

### Priority: 🟡 MEDIUM
**Impact**: Prevents credential stuffing and brute force attacks

### Current Problem

Basic rate limiting exists but:
- No progressive lockout
- No account-level tracking
- Attackers can keep trying after timeout
- No security event escalation

### Requirements

Implement progressive lockout with attempt tracking.

#### Implementation Details

**File**: `server/middleware/bruteForce.js` (NEW)

```javascript
import NodeCache from 'node-cache';
import { createHttpError } from './errorHandler.js';

const failureCache = new NodeCache({ 
  stdTTL: 900,  // 15 minutes
  checkperiod: 60 
});

const lockoutCache = new NodeCache({
  stdTTL: 3600,  // 1 hour max lockout
  checkperiod: 60
});

// Configuration
const config = {
  maxAttempts: 5,
  lockoutDuration: 900,     // 15 minutes
  attemptWindow: 900,       // 15 minute window
  progressiveMultiplier: 2  // Double lockout each time
};

export function trackAuthFailure(portfolioId, ip) {
  const key = `${portfolioId}:${ip}`;
  
  // Check if already locked out
  if (isLockedOut(key)) {
    const lockout = lockoutCache.get(key);
    throw createHttpError({
      status: 429,
      code: 'TOO_MANY_KEY_ATTEMPTS',
      message: 'Account temporarily locked due to too many failed attempts',
      headers: { 
        'Retry-After': Math.ceil(lockout.remainingTime / 1000).toString()
      },
      metadata: {
        locked_until: lockout.lockedUntil,
        attempts: lockout.attempts
      }
    });
  }
  
  // Track failure
  const failures = (failureCache.get(key) || 0) + 1;
  failureCache.set(key, failures);
  
  // Check if should lock out
  if (failures >= config.maxAttempts) {
    applyLockout(key, failures);
    
    throw createHttpError({
      status: 429,
      code: 'TOO_MANY_KEY_ATTEMPTS',
      message: 'Too many failed authentication attempts. Account locked.',
      headers: { 
        'Retry-After': config.lockoutDuration.toString()
      }
    });
  }
  
  return {
    failures,
    remainingAttempts: config.maxAttempts - failures
  };
}

export function clearAuthFailures(portfolioId, ip) {
  const key = `${portfolioId}:${ip}`;
  failureCache.del(key);
  lockoutCache.del(key);
}

function isLockedOut(key) {
  const lockout = lockoutCache.get(key);
  if (!lockout) return false;
  
  const now = Date.now();
  if (now < lockout.lockedUntil) {
    return true;
  }
  
  // Lockout expired
  lockoutCache.del(key);
  return false;
}

function applyLockout(key, attempts) {
  const lockoutCount = getLockoutCount(key);
  const duration = config.lockoutDuration * Math.pow(
    config.progressiveMultiplier, 
    lockoutCount
  );
  
  lockoutCache.set(key, {
    attempts,
    lockoutCount: lockoutCount + 1,
    lockedUntil: Date.now() + duration,
    remainingTime: duration
  }, Math.ceil(duration / 1000));
}

function getLockoutCount(key) {
  const lockout = lockoutCache.get(key);
  return lockout ? lockout.lockoutCount : 0;
}

export function getBruteForceStats() {
  return {
    activeFailures: failureCache.keys().length,
    activeLockouts: lockoutCache.keys().length,
    config
  };
}
```

**File**: `server/app.js` (MODIFY)

Integrate brute force protection:

```javascript
import { trackAuthFailure, clearAuthFailures } from './middleware/bruteForce.js';

// In authentication middleware
function ensureApiKey(req, res, next) {
  const providedKey = req.headers['x-portfolio-key'];
  const portfolioId = req.params.id;
  
  if (!providedKey) {
    trackAuthFailure(portfolioId, req.ip);
    req.auditLog('auth_failed', { reason: 'no_key' });
    return res.status(401).json({ error: 'NO_KEY' });
  }
  
  // Load stored hash
  const stored = loadPortfolioAuth(portfolioId);
  
  if (!stored) {
    return next(); // New portfolio
  }
  
  // Verify key
  const hash = hashKey(providedKey);
  
  if (hash !== stored.hash) {
    const failure = trackAuthFailure(portfolioId, req.ip);
    req.auditLog('auth_failed', { 
      reason: 'invalid_key',
      remaining_attempts: failure.remainingAttempts
    });
    return res.status(403).json({ 
      error: 'INVALID_KEY',
      remaining_attempts: failure.remainingAttempts
    });
  }
  
  // Success - clear failures
  clearAuthFailures(portfolioId, req.ip);
  req.auditLog('auth_success');
  next();
}

// Add stats endpoint
app.get('/api/security/stats', (req, res) => {
  res.json(getBruteForceStats());
});
```

#### Testing Requirements

**File**: `server/__tests__/bruteForce.test.js` (NEW)

```javascript
test('locks out after max attempts', async () => {
  const app = createApp();
  
  // Make 5 failed attempts
  for (let i = 0; i < 5; i++) {
    await request(app)
      .get('/api/portfolio/test')
      .set('X-Portfolio-Key', 'wrong');
  }
  
  // 6th attempt should be locked out
  const res = await request(app)
    .get('/api/portfolio/test')
    .set('X-Portfolio-Key', 'wrong');
  
  assert.equal(res.status, 429);
  assert.equal(res.body.error, 'TOO_MANY_KEY_ATTEMPTS');
  assert.ok(res.headers['retry-after']);
});

test('clears lockout on successful auth', async () => {
  const app = createApp();
  const key = 'ValidKey123!';
  
  // Create portfolio
  await request(app)
    .post('/api/portfolio/test')
    .set('X-Portfolio-Key', key)
    .send({ transactions: [], signals: {} });
  
  // Make failed attempts
  for (let i = 0; i < 3; i++) {
    await request(app)
      .get('/api/portfolio/test')
      .set('X-Portfolio-Key', 'wrong');
  }
  
  // Successful auth should clear failures
  const res = await request(app)
    .get('/api/portfolio/test')
    .set('X-Portfolio-Key', key);
  
  assert.equal(res.status, 200);
  
  // Can make more attempts now
  const res2 = await request(app)
    .get('/api/portfolio/test')
    .set('X-Portfolio-Key', 'wrong');
  
  assert.notEqual(res2.status, 429);
});

test('implements progressive lockout', async () => {
  // Test that lockout duration increases
  // Implementation detail
});
```

#### Success Criteria

- [ ] Progressive lockout implemented
- [ ] Attempt tracking per portfolio+IP
- [ ] Lockout duration doubles on repeat offenses
- [ ] Successful auth clears failures
- [ ] Retry-After header included
- [ ] Security events logged
- [ ] Stats endpoint works
- [ ] All tests pass

---

## Item 3: Response Compression (1 hour)

### Priority: 🟡 MEDIUM
**Impact**: 60-70% smaller response sizes, faster data transfer

### Current Problem

Large JSON responses sent uncompressed:
- Slow on mobile/slow connections
- Higher bandwidth costs
- Poor performance

### Requirements

Enable gzip/brotli compression for API responses.

#### Implementation Details

**Install dependency:**

```bash
npm install compression
```

**File**: `server/app.js` (MODIFY)

```javascript
import compression from 'compression';

// Add compression middleware early in the stack
app.use(compression({
  // Compress responses larger than 1KB
  threshold: 1024,
  
  // Compression level (0-9, 6 is default)
  level: 6,
  
  // Filter function
  filter: (req, res) => {
    // Don't compress if client sends x-no-compression
    if (req.headers['x-no-compression']) {
      return false;
    }
    
    // Use compression's default filter
    return compression.filter(req, res);
  },
  
  // Enable brotli if available
  brotli: {
    enabled: true,
    zlib: {}
  }
}));
```

#### Testing Requirements

**File**: `server/__tests__/compression.test.js` (NEW)

```javascript
test('compresses large responses', async () => {
  const app = createApp();
  
  const res = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('Accept-Encoding', 'gzip');
  
  assert.ok(res.headers['content-encoding']);
  assert.ok(['gzip', 'br'].includes(res.headers['content-encoding']));
});

test('skips compression for small responses', async () => {
  const app = createApp();
  
  const res = await request(app)
    .get('/api/health');
  
  // Health check is small, might not be compressed
  // This is expected behavior
});

test('respects x-no-compression header', async () => {
  const app = createApp();
  
  const res = await request(app)
    .get('/api/prices/AAPL?range=1y')
    .set('X-No-Compression', '1')
    .set('Accept-Encoding', 'gzip');
  
  assert.equal(res.headers['content-encoding'], undefined);
});
```

#### Success Criteria

- [ ] Compression middleware installed
- [ ] Configured appropriately
- [ ] Tests verify compression works
- [ ] Large responses compressed
- [ ] Small responses skip compression
- [ ] Opt-out mechanism works

#### Expected Impact

- Response size: -60-70%
- Transfer time: -50-60%
- Bandwidth usage: -60-70%

---

## Item 4: Bundle Optimization (3 hours)

### Priority: 🟡 MEDIUM
**Impact**: 30% smaller bundles, faster page loads

### Current Problem

Single large JavaScript bundle:
- ~250KB initial load
- All code loaded at once
- Slow first paint
- Poor mobile performance

### Requirements

Implement code splitting and lazy loading.

#### Implementation Details

**File**: `vite.config.js` (MODIFY)

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    // Bundle analyzer (dev only)
    process.env.ANALYZE && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true
    })
  ],
  
  build: {
    // Enable source maps for debugging
    sourcemap: true,
    
    // Rollup options
    rollupOptions: {
      output: {
        // Manual chunks for better caching
        manualChunks: {
          // Vendor chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['decimal.js', 'clsx']
        }
      }
    },
    
    // Chunk size warning limit
    chunkSizeWarningLimit: 500
  },
  
  // Optimizations
  optimizeDeps: {
    include: ['react', 'react-dom', 'recharts']
  }
});
```

**File**: `src/App.jsx` (MODIFY)

Implement lazy loading:

```javascript
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Lazy load heavy components
const Dashboard = lazy(() => import('./components/Dashboard'));
const Holdings = lazy(() => import('./components/Holdings'));
const Transactions = lazy(() => import('./components/TransactionsTab'));
const History = lazy(() => import('./components/History'));
const Metrics = lazy(() => import('./components/Metrics'));
const Reports = lazy(() => import('./components/Reports'));
const Settings = lazy(() => import('./components/Settings'));

// Loading fallback
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <span className="ml-3 text-gray-600">Loading...</span>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/history" element={<History />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
```

**File**: `package.json` (ADD SCRIPT)

```json
{
  "scripts": {
    "analyze": "ANALYZE=true npm run build"
  }
}
```

#### Testing Requirements

Manual testing with bundle analysis:

```bash
# Build and analyze
npm run analyze

# Check bundle sizes
ls -lh dist/assets/*.js

# Expected results:
# - Main bundle: < 100KB (gzipped)
# - Vendor chunks: 50-80KB each
# - Route chunks: 20-50KB each
```

#### Success Criteria

- [ ] Vite config updated with code splitting
- [ ] Manual chunks for vendors
- [ ] Lazy loading for routes
- [ ] Loading fallback component
- [ ] Bundle analyzer configured
- [ ] Main bundle < 100KB gzipped
- [ ] Total size reduced by 30%

#### Expected Impact

- Initial bundle: ~250KB → ~170KB (-30%)
- Time to interactive: ~2s → ~1s (-50%)
- First contentful paint: Faster

---

## Item 5: Frontend Component Tests (3 hours)

### Priority: 🟢 LOW
**Impact**: Better UI coverage, catch regressions

### Current Problem

Limited React component testing:
- Only basic smoke tests
- No user interaction tests
- UI regressions possible
- Low confidence in UI changes

### Requirements

Add comprehensive tests for key UI components.

#### Implementation Details

**Install dependencies:**

```bash
# Already installed: @testing-library/react, @testing-library/user-event
```

**File**: `src/__tests__/Dashboard.test.jsx` (NEW)

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../components/Dashboard';

describe('Dashboard', () => {
  it('renders performance summary', () => {
    render(<Dashboard />);
    
    expect(screen.getByText(/Portfolio Value/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Return/i)).toBeInTheDocument();
  });
  
  it('displays returns chart', () => {
    render(<Dashboard />);
    
    // Chart should be present
    const chart = screen.getByRole('img', { name: /returns chart/i });
    expect(chart).toBeInTheDocument();
  });
  
  it('handles refresh action', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);
    
    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });
});
```

**File**: `src/__tests__/TransactionsTab.test.jsx` (EXPAND)

```javascript
describe('TransactionsTab', () => {
  it('validates transaction form', async () => {
    const user = userEvent.setup();
    render(<TransactionsTab />);
    
    // Try to submit empty form
    const submitButton = screen.getByRole('button', { name: /add/i });
    await user.click(submitButton);
    
    // Should show validation errors
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });
  
  it('calculates shares automatically', async () => {
    const user = userEvent.setup();
    render(<TransactionsTab />);
    
    // Enter amount and price
    await user.type(screen.getByLabelText(/amount/i), '1000');
    await user.type(screen.getByLabelText(/price/i), '100');
    
    // Shares should be calculated
    const sharesInput = screen.getByLabelText(/shares/i);
    expect(sharesInput.value).toBe('10');
  });
  
  it('filters transactions by type', async () => {
    const user = userEvent.setup();
    render(<TransactionsTab transactions={mockTransactions} />);
    
    // Select filter
    const filter = screen.getByLabelText(/type/i);
    await user.selectOptions(filter, 'BUY');
    
    // Only BUY transactions visible
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(mockBuyTransactions.length + 1); // +1 for header
  });
});
```

**File**: `src/__tests__/Holdings.test.jsx` (NEW)

```javascript
describe('Holdings', () => {
  it('displays holdings table', () => {
    render(<Holdings holdings={mockHoldings} />);
    
    expect(screen.getByText(/AAPL/i)).toBeInTheDocument();
    expect(screen.getByText(/MSFT/i)).toBeInTheDocument();
  });
  
  it('shows buy/sell signals', () => {
    const holdingsWithSignals = [
      { ticker: 'AAPL', signal: 'BUY', ... },
      { ticker: 'MSFT', signal: 'TRIM', ... }
    ];
    
    render(<Holdings holdings={holdingsWithSignals} />);
    
    expect(screen.getByText(/BUY/i)).toHaveClass('text-green-600');
    expect(screen.getByText(/TRIM/i)).toHaveClass('text-red-600');
  });
  
  it('updates signal percentage', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    
    render(<Holdings holdings={mockHoldings} onUpdateSignal={onUpdate} />);
    
    const input = screen.getByLabelText(/signal.*AAPL/i);
    await user.clear(input);
    await user.type(input, '10');
    await user.tab(); // Trigger blur
    
    expect(onUpdate).toHaveBeenCalledWith('AAPL', 10);
  });
});
```

#### Testing Requirements

Create tests for:
- [ ] Dashboard component (3-5 tests)
- [ ] TransactionsTab component (5-8 tests)
- [ ] Holdings component (4-6 tests)
- [ ] Metrics component (3-4 tests)
- [ ] Settings component (3-4 tests)

Minimum: 18-25 new UI tests

#### Success Criteria

- [ ] 18+ new frontend tests
- [ ] All tests pass
- [ ] User interactions tested
- [ ] Form validation tested
- [ ] Component rendering tested
- [ ] Props/state changes tested
- [ ] UI coverage >70%

---

## Technical Constraints

### Technology Stack
- **Language**: JavaScript (ES modules)
- **Node Version**: 20+
- **Backend**: Express 4.x
- **Frontend**: React 18.x, Vite 7.x
- **Caching**: NodeCache (already installed)
- **Testing**: Node test runner, Vitest

### Development Principles
- ✅ **Backward Compatible**: No breaking changes
- ✅ **Test Coverage**: Maintain 85%+ coverage
- ✅ **Performance**: Measure before/after
- ✅ **Documentation**: Update README with new features
- ✅ **Code Quality**: Follow existing patterns

### Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Price request time | 1-3s | <200ms | -80% |
| Bundle size | 250KB | 170KB | -30% |
| Cache hit rate | 0% | >80% | New |
| Response size | 100% | 30-40% | -60% |

---

## Expected Deliverables

For each item:

1. **Working Code** with proper patterns
2. **Tests** (unit + integration)
3. **Documentation** updates
4. **Performance** measurements

---

## Verification Steps

### Before Marking Complete

```bash
# 1. Run all tests
npm test

# 2. Check coverage
npm test -- --experimental-test-coverage

# 3. Run linting
npm run lint

# 4. Build frontend
npm run build

# 5. Analyze bundles
npm run analyze

# 6. Start servers and manual test
npm run server
npm run dev

# 7. Performance testing
# - Measure cache hit rate
# - Check response times
# - Verify compression
# - Test bundle sizes
```

### Performance Benchmarks

Before and after each item, measure:

**Item 1 (Caching):**
```bash
# Before: Time 10 price requests
time curl http://localhost:3000/api/prices/AAPL

# After: Check cache stats
curl http://localhost:3000/api/cache/stats
```

**Item 3 (Compression):**
```bash
# Check response size
curl -s http://localhost:3000/api/prices/AAPL | wc -c  # Uncompressed
curl -s -H "Accept-Encoding: gzip" http://localhost:3000/api/prices/AAPL | wc -c  # Compressed
```

**Item 4 (Bundles):**
```bash
# Check bundle sizes
npm run build
ls -lh dist/assets/*.js
```

---

## Output Format

For each completed item:

```markdown
## ✅ Item X: [Name]

### Implementation Summary
[Brief description]

### Changes Made

#### Files Created
- path/to/file.js - [Purpose]

#### Files Modified
- path/to/file.js - [Changes]

### Performance Impact

**Before:**
- [Metric]: [Value]

**After:**
- [Metric]: [Value]
- Improvement: [Percentage]

### Testing

- [x] Unit tests: X tests added
- [x] Integration tests: X tests added
- [x] Manual testing: Completed
- [x] Performance benchmarks: Measured

**Test Results:**
```
✓ All tests passing
Coverage: XX%
```

### Documentation Updated

- [x] README.md
- [x] .env.example
- [x] Inline comments

### Verification

[Describe how you verified it works]
```

---

## Success Criteria

### Phase 2 is Complete When:

- ✅ All 5 items implemented
- ✅ All tests pass (100%)
- ✅ Coverage maintained (85%+)
- ✅ Performance targets met:
  - Price requests < 200ms
  - Cache hit rate > 80%
  - Bundle size < 170KB
  - Response compression working
- ✅ No breaking changes
- ✅ Documentation updated
- ✅ HARDENING_SCOREBOARD updated

---

## Priority Order

Implement in this sequence:

1. **Item 1: Price Caching** (Highest impact)
2. **Item 3: Response Compression** (Quick win)
3. **Item 2: Brute Force Protection** (Security)
4. **Item 4: Bundle Optimization** (User experience)
5. **Item 5: Frontend Tests** (Quality assurance)

---

## Additional Context

### Reference Materials

- **Primary Source**: `comprehensive_audit_v3.md` Section 4 (Performance)
- **Phase 1 Work**: Review implemented patterns
- **NodeCache Docs**: https://www.npmjs.com/package/node-cache
- **Compression Docs**: https://www.npmjs.com/package/compression

### Existing Patterns

Reference these for consistency:
- Middleware: `server/middleware/validation.js`
- Testing: `server/__tests__/audit_log.test.js`
- Error handling: `server/app.js`

---

## Pre-Implementation Checklist

Before starting:

- [ ] Phase 1 is complete and committed
- [ ] All Phase 1 tests passing
- [ ] Understanding of current performance baseline
- [ ] Access to project files
- [ ] NodeCache dependency available (already installed)
- [ ] Compression package ready to install

---

## Phase 2 Timeline

| Item | Priority | Effort | Order |
|------|----------|--------|-------|
| Price Caching | 🔴 HIGH | 3h | 1st |
| Response Compression | 🟡 MEDIUM | 1h | 2nd |
| Brute Force Protection | 🟡 MEDIUM | 3h | 3rd |
| Bundle Optimization | 🟡 MEDIUM | 3h | 4th |
| Frontend Tests | 🟢 LOW | 3h | 5th |

**Total**: ~14 hours over 1-2 weeks

---

## 🚀 Ready to Begin?

**Start with Item 1: Price Data Caching**

This has the highest impact and will immediately improve user experience with 80% faster price requests and 95% fewer external API calls.

---

**Document prepared**: October 6, 2025  
**Phase**: 2 of 3  
**Status**: Ready for implementation