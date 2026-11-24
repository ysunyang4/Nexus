import { fromJsonSchema } from "@modelcontextprotocol/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

const strictSchemaCache = new WeakMap<z.ZodTypeAny, ReturnType<typeof fromJsonSchema>>();
const standardSchemaCache = new WeakMap<z.ZodTypeAny, ReturnType<typeof fromJsonSchema>>();

function extractEnumValues(propDef: any): string[] | null {
  if (!propDef || typeof propDef !== "object") return null;
  const values: string[] = [];

  if (Array.isArray(propDef.enum)) {
    for (const v of propDef.enum) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        values.push(String(v));
      }
    }
  }

  const union = propDef.anyOf || propDef.oneOf;
  if (Array.isArray(union)) {
    for (const sub of union) {
      if (Array.isArray(sub.enum)) {
        for (const v of sub.enum) {
          values.push(String(v));
        }
      } else if (sub.const !== undefined) {
        values.push(String(sub.const));
      }
    }
  }

  if (propDef.const !== undefined && values.length === 0) {
    values.push(String(propDef.const));
  }

  return values.length > 0 ? Array.from(new Set(values)) : null;
}

function translateConstraint(rest: string, _propDef?: any): string {
  if (rest.includes('must match format "uri"') || rest.includes("format uri")) {
    return '符合 URI 格式 ("uri")';
  }
  if (rest.includes('must match format "email"')) {
    return "符合 Email 格式";
  }
  if (rest.includes('must match format "date-time"')) {
    return "符合 ISO 8601 日期时间格式";
  }
  if (rest.includes("must NOT have fewer than")) {
    const minMatch = rest.match(/must NOT have fewer than (\d+) characters/);
    if (minMatch) return `长度不少于 ${minMatch[1]} 个字符`;
    return rest;
  }
  if (rest.includes("must NOT have more than")) {
    const maxMatch = rest.match(/must NOT have more than (\d+) characters/);
    if (maxMatch) return `长度不超过 ${maxMatch[1]} 个字符`;
    return rest;
  }
  if (rest.includes("must be integer") || rest.includes("must be number")) {
    return "为数值类型";
  }
  if (rest.includes("must be string")) {
    return "为字符串类型";
  }
  if (rest.includes("must be boolean")) {
    return "为布尔类型";
  }
  if (rest.includes("must be array")) {
    return "为数组类型";
  }
  if (rest.includes("must be object")) {
    return "为对象类型";
  }
  return rest;
}

function enhanceErrorMessage(
  rawMessage: string,
  properties: Record<string, any> | undefined,
  data: unknown
): { message: string; detail?: string } {
  if (!properties || typeof properties !== "object") return { message: rawMessage, detail: rawMessage };
  const clauses = rawMessage.split(", ");
  const replacedClauses: string[] = [];
  const handledFields = new Set<string>();

  for (const clause of clauses) {
    if (!clause) continue;
    const match = clause.match(/^(?:data[\/\.]|data\['|\/)([a-zA-Z0-9_$]+)(?:\'\])?\s+(.+)$/);
    const field = match?.[1];
    const rest = match?.[2];
    if (field && rest) {
      const isEnumError =
        rest.includes("must be equal to one of the allowed values") ||
        rest.includes("must be equal to constant") ||
        rest.includes("must match a schema in anyOf");

      if (isEnumError && properties[field]) {
        const enumVals = extractEnumValues(properties[field]);
        if (enumVals && enumVals.length > 0) {
          if (!handledFields.has(field)) {
            handledFields.add(field);
            const received =
              data && typeof data === "object" ? (data as Record<string, unknown>)[field] : undefined;
            const receivedStr = JSON.stringify(received) ?? "undefined";
            replacedClauses.push(`${field} 非法：收到 ${receivedStr}，合法值为 ${enumVals.join(" | ")}`);
          }
          continue;
        }
      }

      if (properties[field]) {
        if (!handledFields.has(field)) {
          handledFields.add(field);
          const received =
            data && typeof data === "object" ? (data as Record<string, unknown>)[field] : undefined;
          const receivedStr = JSON.stringify(received) ?? "undefined";
          const constraint = translateConstraint(rest, properties[field]);
          replacedClauses.push(`${field} 非法：收到 ${receivedStr}，要求 ${constraint}`);
        }
        continue;
      }
    }
    replacedClauses.push(clause);
  }
  return { message: replacedClauses.join(", "), detail: rawMessage };
}

function wrapWithValidationEnhancement<T extends ReturnType<typeof fromJsonSchema>>(
  compiled: T,
  properties: Record<string, any> | undefined
): T {
  const standard = (compiled as any)["~standard"];
  if (!standard || typeof standard.validate !== "function") {
    return compiled;
  }

  const origValidate = standard.validate.bind(standard);
  standard.validate = (data: unknown) => {
    const result = origValidate(data);
    const transform = (res: any) => {
      if (!res || !res.issues || !Array.isArray(res.issues)) {
        return res;
      }
      return {
        ...res,
        issues: res.issues.map((issue: any) => {
          if (issue && typeof issue.message === "string") {
            const enhanced = enhanceErrorMessage(issue.message, properties, data);
            return {
              ...issue,
              message: enhanced.message,
              detail: enhanced.detail || issue.message,
            };
          }
          return issue;
        }),
      };
    };

    if (result instanceof Promise) {
      return result.then(transform);
    }
    return transform(result);
  };

  return compiled;
}

/**
 * Convert a Zod schema into an MCP-compliant Standard Schema using JSON Schema.
 * Strips $schema to ensure compatibility across all MCP client tooling.
 */
export function toMcpSchema<T extends z.ZodTypeAny>(
  zodSchema: T,
  options?: { preserveStrict?: boolean }
) {
  const cache = options?.preserveStrict ? strictSchemaCache : standardSchemaCache;
  const cached = cache.get(zodSchema);
  if (cached) {
    return cached;
  }

  const rawSchema = (z as any).toJSONSchema ? (z as any).toJSONSchema(zodSchema) : zodToJsonSchema(zodSchema as any);
  const jsonSchema = JSON.parse(JSON.stringify(rawSchema)) as Record<string, unknown>;
  delete jsonSchema["$schema"];

  if (Array.isArray(jsonSchema.required) && jsonSchema.properties && typeof jsonSchema.properties === "object") {
    const props = jsonSchema.properties as Record<string, any>;
    jsonSchema.required = jsonSchema.required.filter((key: string) => props[key]?.default === undefined);
  }

  if (options?.preserveStrict) {
    const compiled = wrapWithValidationEnhancement(
      fromJsonSchema(jsonSchema),
      jsonSchema.properties as Record<string, any> | undefined
    );
    cache.set(zodSchema, compiled);
    return compiled;
  }

  delete (jsonSchema as any).additionalProperties;

  if (jsonSchema.type === "object" && jsonSchema.properties && typeof jsonSchema.properties === "object") {
    const props = jsonSchema.properties as Record<string, any>;
    if (!props.taskId) {
      props.taskId = { type: "string", description: "Optional Agent Task ID to associate this execution with" };
    }
    if (!props.executionId) {
      props.executionId = { type: "string", description: "Optional Execution ID" };
    }
    if (!props.idempotencyKey) {
      props.idempotencyKey = { type: "string", description: "Optional idempotency key for durable execution" };
    }
    if (!props.failVerification) {
      props.failVerification = { type: "boolean", description: "Simulate verification failure" };
    }
    if (!props.requireScreenChange) {
      props.requireScreenChange = { type: "boolean", description: "Require screen visual delta" };
    }
    if (!props.testScreenHash) {
      props.testScreenHash = { type: "string", description: "Test pre-state screen hash" };
    }
    if (!props.testPostScreenHash) {
      props.testPostScreenHash = { type: "string", description: "Test post-state screen hash" };
    }
  }

  const compiled = wrapWithValidationEnhancement(
    fromJsonSchema(jsonSchema),
    jsonSchema.properties as Record<string, any> | undefined
  );
  cache.set(zodSchema, compiled);
  return compiled;
}
