// server/routes/_schemas.ts
// Shared Zod validation schemas reused across all route files.
// These mirror the validation logic from server/middleware/validation.js.
import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PORTFOLIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

const sanitize = <T extends z.ZodTypeAny>(schema: T): T =>
  (z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), schema) as unknown) as T;

export const isoDateSchema = sanitize(z.string().regex(ISO_DATE_REGEX, 'Must be YYYY-MM-DD'));

export const portfolioIdSchema = sanitize(
  z.string().regex(PORTFOLIO_ID_PATTERN, 'Invalid portfolio ID format'),
);

export const tickerSchema = sanitize(
  z
    .string()
    .regex(SYMBOL_PATTERN, 'Invalid ticker format')
    .transform((v) => v.toUpperCase()),
);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
});

export const transactionTypeSchema = z.enum([
  'BUY',
  'SELL',
  'DIVIDEND',
  'DEPOSIT',
  'WITHDRAWAL',
  'INTEREST',
  'FEE',
  'SPLIT',
]);

// Input schema accepts lowercase and 'WITHDRAW' (legacy), normalizes to uppercase
export const inputTransactionTypeSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized === 'WITHDRAW' ? 'WITHDRAWAL' : normalized;
  }
  return value;
}, transactionTypeSchema);

export const transactionSchema = z.object({
  id: z.string().optional(),
  uid: z.string().optional(),
  createdAt: z.number().int().nonnegative().optional(),
  seq: z.number().int().min(0).optional(),
  date: isoDateSchema,
  type: inputTransactionTypeSchema,
  ticker: tickerSchema.optional(),
  shares: z.number().optional(),
  price: z.number().nonnegative().optional(),
  pricePerShare: z.number().positive().optional(),
  quantity: z.number().optional(),
  amount: z.number().finite(),
  currency: z.literal('USD').optional(),
  notes: z.string().max(500).optional(),
  note: z.string().max(1024).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  internal: z.boolean().optional(),
});

export const cashRateSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema.optional(),
  apy: z.number().min(0).max(100),
});

export const portfolioBodySchema = z.object({
  transactions: z.array(transactionSchema),
  cashRates: z.array(cashRateSchema).optional().default([]),
  signals: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .transform((value) => {
      const result: Record<string, unknown> = {};
      for (const [key, config] of Object.entries(value)) {
        result[key.trim().toUpperCase()] = config;
      }
      return result;
    }),
  settings: z.record(z.string(), z.unknown()).optional(),
  cash: z
    .object({
      currency: z.string().default('USD'),
      apyTimeline: z.array(cashRateSchema).optional().default([]),
    })
    .optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type CashRateInput = z.infer<typeof cashRateSchema>;
export type PortfolioBodyInput = z.infer<typeof portfolioBodySchema>;

export function isValidPortfolioId(id: unknown): boolean {
  return typeof id === 'string' && PORTFOLIO_ID_PATTERN.test(id);
}
