<!-- markdownlint-disable -->
# Task: Implement Priority Security & Documentation Improvements

## Context
You are working on a Node.js/React portfolio management application. A comprehensive 
audit (comprehensive_audit_v3.md) has identified critical improvements needed for 
production readiness.

## Objectives (in priority order)

### Phase 1: IMMEDIATE - Documentation & Security Hardening (Week 1)
**Priority**: CRITICAL | **Estimated Effort**: 8 hours

Implement these 4 high-priority items:

#### 1. Enhanced User Guide in README.md (3 hours)

**Goal**: Make the application accessible to new users with zero prior knowledge

**Requirements**:
- Add complete "Getting Started" section with step-by-step installation
- Add "API Key Setup & Management" section with:
  * Clear explanation of why API keys are needed
  * Examples of strong vs weak keys
  * Step-by-step portfolio creation guide
  * Key rotation instructions
- Add "Troubleshooting" section with common issues and solutions
- Add "Usage Examples" with real-world scenarios
- Reference section 6 of the audit for complete content

**Expected outcome**: A new user can set up and use the portfolio manager without external help.

#### 2. API Key Strength Enforcement (2 hours)

**Goal**: Prevent users from creating weak API keys that compromise security

**Implementation**:
- **File**: `server/middleware/validation.js`
- Add Zod schema requiring:
  * Minimum 12 characters
  * At least 1 uppercase letter (A-Z)
  * At least 1 lowercase letter (a-z)
  * At least 1 number (0-9)
  * At least 1 special character (!@#$%^&*)
- Update auth middleware to validate on first save
- Return clear error (HTTP 400) with requirements when validation fails
- Add frontend validation to show requirements in real-time

**Example error response**:
```json
{
  "error": "WEAK_KEY",
  "message": "API key does not meet strength requirements",
  "requirements": [
    "At least 12 characters",
    "At least 1 uppercase letter",
    "At least 1 lowercase letter",
    "At least 1 number",
    "At least 1 special character"
  ]
}
```

**Reference**: Section 2, item SEC-1 of the audit for implementation details

#### 3. Security Audit Logging (2 hours)

**Goal**: Enable security monitoring and incident response

**Implementation**:
- **Create**: `server/middleware/auditLog.js`
- Log these security events:
  * `auth_success` - Successful authentication
  * `auth_failed` - Failed authentication attempt
  * `key_rotated` - API key rotation
  * `rate_limit_exceeded` - Rate limit hit
  * `weak_key_rejected` - Weak key attempt
- Use structured logging format:
  ```javascript
  {
    event_type: 'security',
    event: 'auth_failed',
    timestamp: '2025-10-06T12:34:56.789Z',
    ip: '192.168.1.1',
    user_agent: 'Mozilla/5.0...',
    portfolio_id: 'my-portfolio',
    reason: 'invalid_key'
  }
  ```
- Integrate with existing Pino logger (req.log)
- Add log aggregation consideration in documentation

**Reference**: Section 2, item SEC-3 of the audit

#### 4. Environment Template (1 hour)

**Goal**: Simplify configuration for new deployments

**Implementation**:
- **Create**: `.env.example` with all documented variables
- Add descriptive comments for each variable
- Group variables by category (Server, Security, Features, Performance)
- Include example values (safe defaults)
- Add to `.gitignore` to ensure `.env` is never committed
- Reference in README.md setup section

**Template structure**:
```bash
# ===========================================
# Portfolio Manager - Environment Variables
# ===========================================
# Copy this file to .env and customize values

# --- Server Configuration ---
NODE_ENV=development
PORT=3000

# --- Data Storage ---
DATA_DIR=./data

# --- Security ---
# Comma-separated list of allowed origins
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# --- Features ---
FEATURES_CASH_BENCHMARKS=true
JOB_NIGHTLY_HOUR=4

# --- Performance ---
API_CACHE_TTL_SECONDS=600
PRICE_FETCH_TIMEOUT_MS=5000

# --- Frontend (optional override) ---
# VITE_API_BASE=http://localhost:3000
```

**Reference**: Appendix B of the audit for complete variable list

---

### Phase 2: Documentation Updates

After implementing Phase 1, update the following files:

#### 1. README.md Updates

**Sections to add/modify**:

- **Getting Started**
  * Prerequisites (Node.js 20+, npm 9+)
  * Installation steps (clone, install, configure)
  * Starting servers (backend + frontend)
  * Accessing the application
  
- **API Key Setup & Management**
  * What are API keys and why they're required
  * Creating strong keys (with examples)
  * First portfolio creation walkthrough
  * Loading existing portfolios
  * Key rotation procedure
  
- **Usage Guide**
  * Adding transactions (with examples)
  * Managing holdings
  * Viewing metrics
  * Exporting reports
  
- **Troubleshooting**
  * Common errors and solutions
  * Connection issues
  * Authentication errors
  * Price fetching problems
  
- **Environment Variables**
  * Table of all variables
  * Required vs optional
  * Default values
  * Descriptions
  
- **API Documentation**
  * Endpoint list with auth requirements
  * Request/response examples
  * Error codes and meanings

#### 2. HARDENING_SCOREBOARD.md

**Create or update** this file to track security improvements:

```markdown
# Security Hardening Scoreboard

Last Updated: [DATE]

## Status Legend
- ✅ Completed
- 🟡 In Progress  
- 📋 Planned
- ❌ Not Started

---

## Phase 1: Immediate Priorities (Week 1)

### Documentation
- [x] Enhanced user guide in README - ✅ Completed [DATE]
- [x] Environment variable template (.env.example) - ✅ Completed [DATE]
- [x] Security documentation (SECURITY.md) - ✅ Completed [DATE]

### Security Enhancements
- [x] API key strength requirements - ✅ Completed [DATE]
- [x] Security audit logging - ✅ Completed [DATE]
- [ ] Enhanced brute force protection - 📋 Planned

### Testing
- [x] Security validation tests - ✅ Completed [DATE]
- [ ] Security event logging tests - 🟡 In Progress

---

## Phase 2: Short-term (Month 1)

### Performance
- [ ] Price data caching - 📋 Planned
- [ ] Response compression - 📋 Planned
- [ ] Bundle optimization - 📋 Planned

### Security
- [ ] Enhanced brute force protection - 📋 Planned
- [ ] Rate limit monitoring - 📋 Planned

---

## Phase 3: Medium-term (Quarter 1)

### Observability
- [ ] Performance monitoring endpoint - 📋 Planned
- [ ] Admin dashboard - 📋 Planned
- [ ] Request ID tracking - 📋 Planned

### Code Quality
- [ ] Complex function refactoring - 📋 Planned
- [ ] Magic numbers extraction - 📋 Planned

---

## Security Metrics

### Current Status
- API Key Strength: ✅ Enforced
- Rate Limiting: ✅ Multi-tier
- Input Validation: ✅ Zod schemas
- Security Headers: ✅ Helmet configured
- Audit Logging: ✅ Implemented
- HTTPS: ⚠️ Required in production

### Coverage
- Security Controls Implemented: 7/12 (58%)
- Critical Issues Resolved: 2/3 (67%)
- High Priority Issues Resolved: 1/4 (25%)

### Next Actions
1. Implement enhanced brute force protection
2. Add price data caching
3. Set up monitoring dashboard
```

#### 3. Related Documentation Files

Update or create these files as needed:

- **docs/SECURITY.md** (NEW)
  * Security best practices
  * API key management guide
  * Incident response procedures
  * Security event definitions
  
- **docs/openapi.yaml**
  * Update if API contracts changed
  * Add new error codes (WEAK_KEY)
  * Document security requirements
  
- **AGENTS.md**
  * Update implementation roadmap
  * Mark completed items
  * Adjust timelines if needed
  
- **CONTRIBUTING.md** (if exists)
  * Add security testing requirements
  * Reference security documentation

---

## Technical Constraints

### Technology Stack
- **Language**: JavaScript (ES modules)
- **Node Version**: 20+
- **Framework**: Express 4.x (backend), React 18.x (frontend)
- **Validation**: Zod 4.x
- **Logging**: Pino 10.x
- **Testing**: Node test runner

### Development Principles
- ✅ **No Breaking Changes**: Existing functionality must continue working
- ✅ **Test Coverage**: Add tests for all new validation/security features
- ✅ **Error Handling**: Use existing error patterns (http-errors)
- ✅ **Logging**: Use existing Pino logger instance (req.log)
- ✅ **Code Style**: Follow existing patterns in the codebase
- ✅ **Documentation**: Update inline comments and external docs

### File Organization
- Middleware: `server/middleware/`
- Tests: `server/__tests__/`
- Documentation: `docs/`
- Configuration: Root directory (`.env.example`, etc.)

---

## Expected Deliverables

For each implementation, provide:

### 1. Working Code
- ✅ Proper error handling
- ✅ Input validation
- ✅ Security considerations
- ✅ Performance considerations

### 2. Tests
- ✅ Unit tests for new functions
- ✅ Integration tests for API changes
- ✅ Edge case coverage
- ✅ All tests pass

### 3. Documentation
- ✅ Updated README.md
- ✅ Inline code comments
- ✅ API documentation (if applicable)
- ✅ Example usage

### 4. Configuration
- ✅ Environment variables documented
- ✅ Default values specified
- ✅ Migration notes (if applicable)

---

## Verification Steps

### Before Marking Complete

Run these checks:

```bash
# 1. Install dependencies (if new ones added)
npm install

# 2. Run all tests
npm test

# 3. Check test coverage
npm test -- --experimental-test-coverage

# 4. Run linting
npm run lint

# 5. Start servers and verify manually
npm run server  # Terminal 1
npm run dev     # Terminal 2
```

### Manual Testing Checklist

- [ ] **Weak API Keys**: Try creating portfolio with "password123"
  * Expected: Error message with requirements
  
- [ ] **Strong API Keys**: Try creating portfolio with "MyPortfolio2024!Secure"
  * Expected: Success
  
- [ ] **Security Logging**: Check logs for auth events
  * Expected: Structured log entries with all required fields
  
- [ ] **Environment Setup**: Follow README from scratch
  * Expected: Can set up and run application
  
- [ ] **Key Rotation**: Change API key using rotation flow
  * Expected: Key rotated, logged, still can access portfolio
  
- [ ] **Documentation**: Review all updated docs
  * Expected: Clear, accurate, no broken links

### Automated Checks

```javascript
// Example test cases that should pass

test('rejects weak API key', async () => {
  const result = await validateApiKeyStrength('password');
  assert.throws(() => result);
});

test('accepts strong API key', async () => {
  const result = await validateApiKeyStrength('MyPortfolio2024!Secure');
  assert.ok(result);
});

test('logs security events', async () => {
  const logSpy = sinon.spy(logger, 'warn');
  await logSecurityEvent(req, 'auth_failed', { reason: 'invalid_key' });
  assert.ok(logSpy.calledWith(sinon.match({ event: 'auth_failed' })));
});
```

---

## Output Format

For each completed item, provide a structured report:

```markdown
## ✅ [Item Name]

### Implementation Summary
Brief description of what was implemented and why.

### Changes Made

#### Files Created
- `path/to/new/file.js`
  * Purpose: [description]
  * Key functions: [list]

#### Files Modified
- `path/to/existing/file.js`
  * Added: [description]
  * Modified: [description]
  * Removed: [description]

### Code Highlights

```javascript
// Show key implementation details
export function validateApiKeyStrength(key) {
  const schema = z.string()
    .min(12)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    // ...
  return schema.parse(key);
}
```

### Testing

- [x] Unit tests added (5 tests)
- [x] Integration tests updated (2 tests)
- [x] Manual testing completed
- [x] Edge cases covered (weak keys, empty strings, special chars)

**Test Results**:
```
✓ validates strong keys
✓ rejects weak keys
✓ provides clear error messages
✓ handles edge cases
✓ integrates with existing auth flow
```

### Documentation Updated

- [x] README.md - Added "API Key Setup" section
- [x] Inline comments - Added JSDoc comments
- [x] HARDENING_SCOREBOARD.md - Marked as completed
- [x] SECURITY.md - Added key strength requirements

### Migration Notes

For existing users:
- Existing weak keys will continue to work (backward compatible)
- New portfolios require strong keys
- Recommend key rotation for existing portfolios

### Performance Impact

- Minimal: Single regex validation on save (< 1ms)
- No impact on read operations

### Security Impact

- Reduces risk of brute force attacks
- Prevents dictionary attacks
- Improves overall security posture
```

---

## Success Criteria

### Phase 1 is Complete When:

- ✅ **User Experience**
  * New user can follow README to set up portfolio from scratch
  * Error messages are clear and actionable
  * Environment configuration is straightforward
  
- ✅ **Security**
  * Weak API keys are rejected with helpful error messages
  * Strong API keys are accepted
  * All security events are logged with structured data
  
- ✅ **Documentation**
  * README is comprehensive and accurate
  * .env.example guides new users through configuration
  * HARDENING_SCOREBOARD accurately reflects progress
  * All related docs are updated
  
- ✅ **Quality**
  * All tests pass (100%)
  * No linting errors
  * No console warnings
  * Backward compatibility maintained
  
- ✅ **Code Quality**
  * Follows existing patterns
  * Proper error handling
  * Adequate test coverage (>85%)
  * Clear comments and documentation

### Acceptance Test

A reviewer should be able to:

1. Clone the repository
2. Follow README to set up environment
3. Create a portfolio with a strong key (success)
4. Try to create a portfolio with a weak key (clear error)
5. See security events in logs
6. Rotate an API key successfully
7. Understand all configuration options from .env.example

---

## Additional Context

### Reference Materials

- **Primary Source**: `comprehensive_audit_v3.md`
  * Section 2: Security Audit (detailed recommendations)
  * Section 6: Complete User Guide (content to add to README)
  * Section 7: Priority Action Items (implementation order)
  * Appendix B: Environment Variables (complete list)

### Existing Code Patterns

Reference these files for consistency:

- **Error Handling**: `server/middleware/errorHandler.js`
- **Validation**: `server/middleware/validation.js`
- **Logging**: `server/app.js` (Pino setup)
- **Testing**: `server/__tests__/*.test.js`

### Dependencies

Already installed (no new installs needed):
- `zod` - Validation schemas
- `pino` - Structured logging
- `http-errors` - Error creation
- `express` - Web framework

---

## Pre-Implementation Checklist

### Answer These Questions Before Starting:

1. **Access**: Do you have access to the project files?
   - [ ] Yes, I can read/write files
   - [ ] No, I need access
   
2. **Understanding**: Have you read comprehensive_audit_v3.md thoroughly?
   - [ ] Yes, I understand the requirements
   - [ ] No, I need clarification on: [specify]
   
3. **Priority**: Do you understand the priority order (Phase 1 first)?
   - [ ] Yes, starting with Phase 1, Item 1
   - [ ] No, please clarify
   
4. **Dependencies**: Are there any dependencies that need to be installed?
   - [ ] No, all dependencies are already installed
   - [ ] Yes, I need to install: [specify]
   
5. **Blockers**: Are there any blockers or unclear requirements?
   - [ ] No blockers, ready to proceed
   - [ ] Yes, I need clarification on: [specify]

---

## Implementation Order

**Follow this sequence:**

1. ✅ Read and understand comprehensive_audit_v3.md
2. ✅ Implement Item 1: Enhanced User Guide in README.md
3. ✅ Implement Item 2: API Key Strength Enforcement
4. ✅ Implement Item 3: Security Audit Logging
5. ✅ Implement Item 4: Environment Template
6. ✅ Update HARDENING_SCOREBOARD.md
7. ✅ Update related documentation
8. ✅ Run verification steps
9. ✅ Provide completion report

---

## Support & Questions

If you need clarification on any requirement:

1. **Ask Specific Questions**: Reference exact sections of the audit
2. **Provide Context**: Explain what you're trying to implement
3. **Suggest Alternatives**: If you see a better approach, propose it
4. **Show Examples**: Use code snippets to illustrate your question

---

**🚀 Ready to begin? Start with Phase 1, Item 1 (Enhanced User Guide).**

---
