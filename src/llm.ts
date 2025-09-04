import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

const QuoteBodySchema = z.object({
  provider: z.string().openapi({ example: "openai" }),
  model: z.string().openapi({ example: "gpt-4.1-mini" }),
  system: z.string().optional().openapi({ example: "You are a helpful assistant" }),
  prompt: z.string().openapi({ example: "Explain Romans 8:28" }),
  max_output_tokens: z.number().optional().default(512).openapi({ example: 512 }),
  expected_output_tokens: z.number().optional().default(400).openapi({ example: 400 }),
});

const QuoteResponseSchema = z.object({
  quote_id: z.string(),
  input_tokens: z.number(),
  estimated_output_tokens: z.number(),
  price_per_1k: z.object({ input: z.number(), output: z.number() }),
  estimated_cost_usd: z.number(),
  caps: z.object({
    max_cost_usd: z.number(),
    max_output_tokens: z.number(),
  }),
  expires_in_seconds: z.number(),
});

export const quote = createRoute({
  method: "post",
  path: "/quote",
  operationId: "quote",
  summary: "Estimate token usage & cost",
  security: [
    { Bearer: [] },
  ],
  request: {
    body: {
      content: {
        "application/json": { schema: QuoteBodySchema },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: QuoteResponseSchema } },
      description: "Quote",
    },
  },
});

const ConfirmBodySchema = z.object({
  quote_id: z.string(),
  accept: z.boolean(),
});

const ConfirmResponseSchema = z.object({
  run_id: z.string(),
  answer: z.string(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
  actual_cost_usd: z.number(),
  model: z.string(),
  provider: z.string(),
});

export const confirm = createRoute({
  method: "post",
  path: "/confirm",
  operationId: "confirm",
  summary: "Run previously quoted request after approval",
  security: [
    { Bearer: [] },
  ],
  request: {
    body: {
      content: {
        "application/json": { schema: ConfirmBodySchema },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ConfirmResponseSchema } },
      description: "Result",
    },
  },
});
