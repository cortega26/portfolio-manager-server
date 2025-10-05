import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u;
const TICKER_REGEX = /^[A-Za-z0-9._-]{1,32}$/u;

const sanitizeString = (schema) =>
  z.preprocess((value) => (typeof value === "string" ? value.trim() : value), schema);

const isoDateSchema = sanitizeString(
  z
    .string({ invalid_type_error: "Expected ISO date string" })
    .regex(ISO_DATE_REGEX, "Must be ISO date (YYYY-MM-DD)"),
);

const tickerSchema = sanitizeString(
  z
    .string({ invalid_type_error: "Ticker must be a string" })
    .min(1, "Ticker is required")
    .max(32, "Ticker must be at most 32 characters")
    .regex(TICKER_REGEX, "Ticker must match [A-Za-z0-9._-]{1,32}")
    .transform((value) => value.toUpperCase()),
);

const transactionTypeSchema = z.enum([
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAWAL",
  "INTEREST",
  "FEE",
]);

const inputTransactionTypeSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized === "WITHDRAW") {
      return "WITHDRAWAL";
    }
    return normalized;
  }
  return value;
}, transactionTypeSchema);

const numeric = (message) =>
  z
    .coerce.number({ invalid_type_error: message })
    .refine((value) => Number.isFinite(value), message);

const optionalNumeric = (message) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? undefined : value),
    z
      .coerce.number({ invalid_type_error: message })
      .refine((value) => Number.isFinite(value), message)
      .optional(),
  );

const transactionSchema = z
  .object({
    id: sanitizeString(z.string().min(1).max(128)).optional(),
    uid: sanitizeString(z.string().min(1).max(128)).optional(),
    date: isoDateSchema,
    ticker: tickerSchema.optional(),
    type: inputTransactionTypeSchema,
    amount: numeric("Amount must be a finite number"),
    price: optionalNumeric("Price must be a finite number"),
    quantity: optionalNumeric("Quantity must be a finite number"),
    shares: optionalNumeric("Shares must be a finite number"),
    note: sanitizeString(z.string().max(1024)).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .transform((value) => {
    const ticker = value.ticker ?? undefined;
    const hasTicker = typeof ticker === "string" && ticker.length > 0;
    const amount = Number(value.amount);
    let quantity = typeof value.quantity === "number" ? Number(value.quantity) : undefined;
    if (quantity === undefined && typeof value.shares === "number") {
      quantity = Number(value.shares);
    }
    const price = typeof value.price === "number" ? Number(value.price) : undefined;

    return {
      ...value,
      ticker: hasTicker ? ticker : undefined,
      amount,
      quantity,
      price,
    };
  })
  .superRefine((value, ctx) => {
    const needsTicker = !["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "FEE"].includes(
      value.type,
    );
    if (needsTicker && !value.ticker) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ticker is required for non-cash transactions",
        path: ["ticker"],
      });
    }
    if (value.price !== undefined && value.price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Price must be greater than 0",
        path: ["price"],
      });
    }
  });

const signalEntrySchema = z
  .object({
    pct: numeric("Signal percentage must be a finite number")
      .min(0, "Signal percentage must be non-negative")
      .max(100, "Signal percentage cannot exceed 100"),
  })
  .transform((value) => ({ pct: Number(value.pct) }));

const signalsSchema = z
  .object({})
  .catchall(signalEntrySchema)
  .superRefine((signals, ctx) => {
    for (const key of Object.keys(signals)) {
      const normalized = key.trim().toUpperCase();
      if (!TICKER_REGEX.test(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Signal ticker must match [A-Za-z0-9._-]{1,32}",
          path: [key],
        });
      }
    }
  })
  .transform((signals) => {
    const normalized = {};
    for (const [key, config] of Object.entries(signals)) {
      const normalizedKey = key.trim().toUpperCase();
      normalized[normalizedKey] = config;
    }
    return normalized;
  });

const settingsSchema = z
  .object({
    autoClip: z.boolean().optional(),
  })
  .catchall(z.unknown())
  .transform((value) => ({ autoClip: Boolean(value.autoClip) }));

export const portfolioPayloadSchema = z
  .object({
    transactions: z.array(transactionSchema).max(250_000).default([]),
    signals: signalsSchema.optional().default({}),
    settings: settingsSchema.optional().default({ autoClip: false }),
  })
  .transform((value) => ({
    transactions: value.transactions,
    signals: value.signals,
    settings: value.settings,
  }));

export function validateAndNormalizePortfolioPayload(payload) {
  const result = portfolioPayloadSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    const baseMessage = "Portfolio payload validation failed";
    const error = new Error(message ? baseMessage + ": " + message : baseMessage);
    error.name = "PortfolioValidationError";
    error.issues = result.error.issues;
    throw error;
  }
  return result.data;
}

