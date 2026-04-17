const DEFAULT_EXTERNAL_CONNECT_SRC = Object.freeze([
  'https://www.tooltician.com',
  'https://api.tooltician.com',
]);

const DEFAULT_DEV_DIRECTIVES = Object.freeze([
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:']],
  ['font-src', ["'self'", 'data:']],
  ['frame-ancestors', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
]);

function normalizeHost(host) {
  if (typeof host !== 'string') {
    return '127.0.0.1';
  }
  const trimmed = host.trim();
  return trimmed.length > 0 ? trimmed : '127.0.0.1';
}

function normalizeDirectiveName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.trim().toLowerCase();
}

function splitDirective(segment) {
  if (typeof segment !== 'string') {
    return null;
  }
  const trimmed = segment.trim();
  if (!trimmed) {
    return null;
  }
  const tokens = trimmed.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }
  return {
    name: normalizeDirectiveName(tokens[0]),
    values: tokens.slice(1),
  };
}

function parseCsp(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return [];
  }
  return source
    .split(';')
    .map((segment) => splitDirective(segment))
    .filter(Boolean);
}

function uniqPreservingOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function getElectronDevConnectSrc(host) {
  const normalizedHost = normalizeHost(host);
  return uniqPreservingOrder([
    "'self'",
    'http://127.0.0.1:*',
    'ws://127.0.0.1:*',
    'http://localhost:*',
    'ws://localhost:*',
    `http://${normalizedHost}:*`,
    `ws://${normalizedHost}:*`,
    ...DEFAULT_EXTERNAL_CONNECT_SRC,
  ]);
}

function buildDefaultDirectives(host) {
  return [
    ...DEFAULT_DEV_DIRECTIVES.map(([name, values]) => ({
      name,
      values: [...values],
    })),
    {
      name: 'connect-src',
      values: getElectronDevConnectSrc(host),
    },
  ];
}

function serializeCsp(directives) {
  return directives
    .filter((directive) => directive?.name)
    .map((directive) => {
      const values = uniqPreservingOrder(directive.values ?? []);
      return values.length > 0 ? `${directive.name} ${values.join(' ')}` : directive.name;
    })
    .join('; ');
}

export function buildElectronDevCsp({ host, baseCsp } = {}) {
  const requiredConnectSrc = getElectronDevConnectSrc(host);
  const directives =
    typeof baseCsp === 'string' && baseCsp.trim().length > 0
      ? parseCsp(baseCsp)
      : buildDefaultDirectives(host);

  const connectSrcIndex = directives.findIndex((directive) => directive.name === 'connect-src');
  if (connectSrcIndex >= 0) {
    directives[connectSrcIndex] = {
      name: 'connect-src',
      values: uniqPreservingOrder([
        ...(directives[connectSrcIndex].values ?? []),
        ...requiredConnectSrc,
      ]),
    };
  } else {
    directives.push({
      name: 'connect-src',
      values: requiredConnectSrc,
    });
  }

  return serializeCsp(directives);
}

export default buildElectronDevCsp;
