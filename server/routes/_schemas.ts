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
  'SPLIT',
]);

// Input schema accepts 'WITHDRAW' (legacy) and normalizes it to 'WITHDRAWAL'
export const inputTransactionTypeSchema = transactionTypeSchema.or(
  z.literal('WITHDRAW').transform(() => 'WITHDRAWAL' as const),
);

export const transactionSchema = z.object({
  id: z.string().optional(),
  date: isoDateSchema,
  type: inputTransactionTypeSchema,
  ticker: tickerSchema.optional(),
  shares: z.number().optional(),
  pricePerShare: z.number().positive().optional(),
  amount: z.number().finite(),
  currency: z.literal('USD').default('USD'),
  notes: z.string().max(500).optional(),
});

export const cashRateSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema.optional(),
  apy: z.number().min(0).max(100),
});

export const portfolioBodySchema = z.object({
  transactions: z.array(transactionSchema),
  cashRates: z.array(cashRateSchema).optional().default([]),
  signals: z.record(z.string(), z.unknown()).optional().default({}),
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
