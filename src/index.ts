import { OpenAPIHono } from "@hono/zod-openapi";
import { bearerAuth } from "hono/bearer-auth";
import { Bindings } from "./bindings";
import { swaggerUI } from "@hono/swagger-ui";
import { getUser, createUser, updateUser } from "./users";
import { quote, confirm } from "./llm";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

app.doc31("/doc", (c) => ({
  openapi: c.env.OPENAPI_VERSION,
  info: {
    version: c.env.TOOL_VERSION,
    title: c.env.TOOL_NAME,
    description: c.env.TOOL_DESCRIPTION,
  },
  servers: [{ url: new URL(c.req.url).origin }],
}));

app.get("/ui", swaggerUI({ url: "/doc" }));

app.use(
  bearerAuth({
    verifyToken: async (token, c) => {
      return token === c.env.TOKEN;
    },
  })
);

app
  .openapi(getUser, async (c) => {
    const user_id = c.req.param("user_id");
    try {
      let user = await c.env.DB.prepare("SELECT * FROM users WHERE user_id = ?")
        .bind(user_id)
        .first();
      if (!user) {
        return c.json({
          error: "Not Found",
        });
      }
      return c.json({
        data: user,
        error: null,
      });
    } catch (e) {
      return c.json({
        error: "Internal Server Error",
      });
    }
  })
  .openapi(createUser, async (c) => {
    const { user_id, user_name } = c.req.valid("json");
    try {
      let { success } = await c.env.DB.prepare(
        "INSERT INTO users (user_id, user_name) VALUES (?, ?)"
      )
        .bind(user_id, user_name)
        .run();
      if (success) {
        let user = await c.env.DB.prepare(
          "SELECT * FROM users WHERE user_id = ?"
        )
          .bind(user_id)
          .first();
        return c.json({
          data: user,
          error: null,
        });
      } else {
        return c.json({
          error: "Internal Server Error",
        });
      }
    } catch (e) {
      return c.json({
        error: "Internal Server Error",
      });
    }
  })
  .openapi(updateUser, async (c) => {
    const user_id = c.req.param("user_id");
    const { user_name } = c.req.valid("json");
    try {
      let { success } = await c.env.DB.prepare(
        "UPDATE users SET user_name = ? WHERE user_id = ?"
      )
        .bind(user_name, user_id)
        .run();
      if (success) {
        let user = await c.env.DB.prepare(
          "SELECT * FROM users WHERE user_id = ?"
        )
          .bind(user_id)
          .first();
        return c.json({
          data: user,
          error: null,
        });
      } else {
        return c.json({
          error: "Internal Server Error",
        });
      }
    } catch (e) {
      return c.json({
        error: "Internal Server Error",
      });
    }
  })
  .openapi(quote, async (c) => {
    const {
      provider,
      model,
      system = "",
      prompt,
      max_output_tokens = 512,
      expected_output_tokens = 400,
    } = c.req.valid("json");

    const pricing = JSON.parse(c.env.PRICING_JSON as string) as Record<string, { in: number; out: number }>;
    const key = `${provider}:${model}`;
    const p = pricing[key];
    if (!p) {
      return c.json({ error: `Pricing not configured for ${key}` }, 400);
    }

    const inputTokens = Math.ceil((system + "\n" + prompt).length / 4);
    const estOut = Math.min(expected_output_tokens, max_output_tokens);
    const estCost = (inputTokens * p.in + estOut * p.out) / 1000;

    const id = crypto.randomUUID();
    const quoteData = {
      id,
      provider,
      model,
      system,
      prompt,
      inputTokens,
      estOut,
      estCost,
      caps: { max_output_tokens, max_cost_usd: 1.0 },
    };
    await c.env.QUOTES_KV.put(`q:${id}`, JSON.stringify(quoteData), { expirationTtl: 900 });

    return c.json({
      quote_id: id,
      input_tokens: inputTokens,
      estimated_output_tokens: estOut,
      price_per_1k: { input: p.in, output: p.out },
      estimated_cost_usd: Math.round(estCost * 100) / 100,
      caps: quoteData.caps,
      expires_in_seconds: 900,
    });
  })
  .openapi(confirm, async (c) => {
    const { quote_id, accept } = c.req.valid("json");
    if (!accept) {
      return c.json({ error: "Not accepted" }, 400);
    }

    const raw = await c.env.QUOTES_KV.get(`q:${quote_id}`);
    if (!raw) {
      return c.json({ error: "Quote expired or not found" }, 404);
    }
    const q = JSON.parse(raw);

    const pricing = JSON.parse(c.env.PRICING_JSON as string) as Record<string, { in: number; out: number }>;
    const p = pricing[`${q.provider}:${q.model}`];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: q.model,
        messages: [
          ...(q.system ? [{ role: "system", content: q.system }] : []),
          { role: "user", content: q.prompt },
        ],
        max_tokens: q.caps.max_output_tokens,
      }),
    });
    const j = await r.json();
    const answer = j.choices?.[0]?.message?.content ?? "";
    const usage = {
      input_tokens: j.usage?.prompt_tokens ?? q.inputTokens,
      output_tokens: j.usage?.completion_tokens ?? 0,
    };
    const cost = (usage.input_tokens * p.in + usage.output_tokens * p.out) / 1000;

    return c.json({
      run_id: crypto.randomUUID(),
      answer,
      usage,
      actual_cost_usd: Math.round(cost * 100) / 100,
      model: q.model,
      provider: q.provider,
    });
  });

app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
  type: "http",
  scheme: "bearer",
});
export default app;
