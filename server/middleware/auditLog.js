const DEFAULT_EVENT_FIELDS = Object.freeze([
  'event_type',
  'event',
  'timestamp',
  'request_id',
  'ip',
  'user_agent',
  'portfolio_id',
]);

function resolveClientIp(req, override) {
  if (override) {
    return override;
  }
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    const [first] = forwarded.split(',');
    if (first) {
      return first.trim();
    }
  }
  if (typeof req.ip === 'string' && req.ip) {
    return req.ip;
  }
  if (req.connection?.remoteAddress) {
    return req.connection.remoteAddress;
  }
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return undefined;
}

function resolveUserAgent(req, override) {
  if (override) {
    return override;
  }
  if (typeof req.get === 'function') {
    return req.get('user-agent') ?? undefined;
  }
  return req.headers?.['user-agent'];
}

function resolvePortfolioId(req, details = {}) {
  if (details.portfolio_id) {
    return details.portfolio_id;
  }
  if (details.portfolioId) {
    return details.portfolioId;
  }
  if (req.params?.id) {
    return req.params.id;
  }
  if (req.body?.portfolio_id) {
    return req.body.portfolio_id;
  }
  return undefined;
}

export function createSecurityAuditLogger({ logger, sink } = {}) {
  const baseLogger = logger ?? console;

  return function securityAuditLogger(req, _res, next) {
    const requestLogger = typeof req.log?.child === 'function'
      ? req.log.child({ component: 'security_audit' })
      : req.log ?? baseLogger;

    req.auditLog = (event, details = {}) => {
      const timestamp = new Date().toISOString();
      const payload = {
        event_type: 'security',
        event,
        timestamp,
        request_id: details.request_id ?? req.id ?? req.headers?.['x-request-id'],
        ip: resolveClientIp(req, details.ip),
        user_agent: resolveUserAgent(req, details.user_agent),
        portfolio_id: resolvePortfolioId(req, details),
        ...details,
      };

      // Canonicalise property names
      if (Object.prototype.hasOwnProperty.call(payload, 'portfolioId')) {
        delete payload.portfolioId;
      }

      if (typeof requestLogger?.info === 'function') {
        requestLogger.info(payload);
      }
      if (typeof sink === 'function') {
        sink({ ...payload });
      }
    };

    next();
  };
}

export const SECURITY_EVENT_FIELDS = DEFAULT_EVENT_FIELDS;
