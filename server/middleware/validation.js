import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u;
const PORTFOLIO_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/u;
const SYMBOL_REGEX = /^[A-Za-z0-9._-]{1,32}$/u;

const sanitizeString = (schema) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), schema);

const isoDateSchema = sanitizeString(
  z
    .string({ invalid_type_error: 'Expected ISO date string' })
    .regex(ISO_DATE_REGEX, 'Must be ISO date (YYYY-MM-DD)'),
);

const portfolioIdSchema = sanitizeString(
  z
    .string({ invalid_type_error: 'Portfolio id must be a string' })
    .regex(PORTFOLIO_ID_REGEX, 'Portfolio id must match [A-Za-z0-9_-]{1,64}'),
);

const tickerSchema = sanitizeString(
  z
    .string({ invalid_type_error: 'Ticker must be a string' })
    .min(1, 'Ticker is required')
    .max(32, 'Ticker must be at most 32 characters')
    .regex(SYMBOL_REGEX, 'Ticker must match [A-Za-z0-9._-]{1,32}')
    .transform((value) => value.toUpperCase()),
);

const numeric = (message) =>
  z
    .number({ invalid_type_error: message })
    .refine((value) => Number.isFinite(value), message);

const transactionTypeSchema = z
  .enum(['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'FEE'])
  .transform((value) => value.toUpperCase());

const inputTransactionTypeSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'WITHDRAW') {
      return 'WITHDRAWAL';
    }
    return normalized;
  }
  return value;
}, transactionTypeSchema);

const transactionSchema = z
  .object({
    id: sanitizeString(z.string().min(1).max(128)).optional(),
    uid: sanitizeString(z.string().min(1).max(128)).optional(),
    date: isoDateSchema,
    ticker: tickerSchema.optional(),
    type: inputTransactionTypeSchema,
    amount: numeric('Amount must be a finite number'),
    price: numeric('Price must be a finite number').nonnegative('Price cannot be negative').optional(),
    quantity: numeric('Quantity must be a finite number').optional(),
    shares: numeric('Shares must be a finite number').optional(),
    note: sanitizeString(z.string().max(1024)).optional(),
    metadata: z.record(z.unknown()).optional(),
    internal: z.boolean().optional(),
  })
  .transform((value) => {
    const ticker = value.ticker ?? null;
    const canonicalTicker = ticker ? ticker.toUpperCase() : null;
    let quantity = value.quantity;
    if (typeof quantity !== 'number' && typeof value.shares === 'number') {
      const shares = value.shares;
      switch (value.type) {
        case 'SELL':
          quantity = -Math.abs(shares);
          break;
        case 'BUY':
          quantity = Math.abs(shares);
          break;
        default:
          quantity = shares;
          break;
      }
    }
    if (typeof quantity !== 'number') {
      quantity = 0;
    }
    const amount = Number(value.amount);
    return {
      ...value,
      ticker: canonicalTicker ?? undefined,
      quantity: Number(quantity),
      amount,
    };
  })
  .superRefine((value, ctx) => {
    if (
      !value.ticker &&
      !['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE'].includes(value.type)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ticker is required for non-cash transactions',
        path: ['ticker'],
      });
    }
  });

const signalConfigSchema = z
  .object({
    pct: numeric('Signal percentage must be a finite number')
      .min(0, 'Percentage must be non-negative')
      .max(100, 'Percentage cannot exceed 100'),
  })
  .transform((value) => ({ pct: Number(value.pct) }));

const signalsSchema = z
  .object({})
  .catchall(signalConfigSchema)
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      const normalized = key.trim().toUpperCase();
      if (!SYMBOL_REGEX.test(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Signal ticker must match [A-Za-z0-9._-]{1,32}',
          path: [key],
        });
      }
    }
  })
  .transform((value) => {
    const result = {};
    for (const [key, config] of Object.entries(value)) {
      const normalized = key.trim().toUpperCase();
      result[normalized] = config;
    }
    return result;
  });

const portfolioBodySchema = z
  .object({
    transactions: z.array(transactionSchema).max(250_000).default([]),
    signals: signalsSchema.optional().default({}),
    settings: z
      .object({
        autoClip: z.boolean().default(false),
      })
      .partial()
      .optional()
      .default({}),
  })
  .transform((value) => ({
    transactions: value.transactions,
    signals: value.signals,
    settings: { autoClip: Boolean(value.settings?.autoClip) },
  }));

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(500).default(100),
});

const returnsQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    views: sanitizeString(z.string())
      .optional()
      .transform((value) => {
        if (!value) {
          return ['port', 'excash', 'spy', 'bench'];
        }
        return value
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
      }),
  })
  .merge(paginationSchema)
  .transform((value) => ({
    from: value.from ?? null,
    to: value.to ?? null,
    views: Array.from(new Set(value.views)),
    page: value.page,
    perPage: value.per_page,
  }));

const rangeQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .merge(paginationSchema)
  .transform((value) => ({
    from: value.from ?? null,
    to: value.to ?? null,
    page: value.page,
    perPage: value.per_page,
  }));

const cashRateBodySchema = z.object({
  effective_date: isoDateSchema,
  apy: numeric('APY must be a finite number'),
});

const validationErrorFromZod = (error) => {
  const details = error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
  const err = new Error('Request validation failed.');
  err.status = 400;
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  err.details = details;
  err.expose = true;
  return err;
};

const parseWith = (schema, sourceKey) => (req, _res, next) => {
  const result = schema.safeParse(req[sourceKey] ?? {});
  if (!result.success) {
    next(validationErrorFromZod(result.error));
    return;
  }
  req[sourceKey] = result.data;
  next();
};

export const validatePortfolioIdParam = (req, _res, next) => {
  const result = portfolioIdSchema.safeParse(req.params?.id);
  if (!result.success) {
    next(validationErrorFromZod(result.error));
    return;
  }
  req.params.id = result.data;
  next();
};

export const validatePortfolioBody = parseWith(portfolioBodySchema, 'body');
export const validateCashRateBody = parseWith(cashRateBodySchema, 'body');
export const validateReturnsQuery = parseWith(returnsQuerySchema, 'query');
export const validateRangeQuery = parseWith(rangeQuerySchema, 'query');

export {
  isoDateSchema,
  portfolioBodySchema,
  paginationSchema,
  returnsQuerySchema,
  rangeQuerySchema,
  cashRateBodySchema,
  validationErrorFromZod,
};

