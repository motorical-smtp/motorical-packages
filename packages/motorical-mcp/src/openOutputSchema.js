// packages/motorical-mcp/src/openOutputSchema.js
//
// Turns a tool's declared output SHAPE into a zod object that is OPEN at every
// level. The SDK's objectFromShape builds a CLOSED top-level object, which is
// advertised as JSON Schema `additionalProperties:false`. A strict MCP client
// validates structuredContent against that advertised schema, so any field the
// backend adds later makes a SUCCESSFUL call look like an error (first real
// Motor Block create, 2026-09-24) and an agent may then retry and duplicate the
// action. Our own zod validation ignores unknown keys, which is why this never
// showed up in-process.
//
// One choke point instead of `.passthrough()` sprinkled per field: both the
// native dispatcher and the legacy SDK registration route every outputSchema
// through here, so a new tool is safe by construction. Declared fields keep
// their types, required-ness, nullability and descriptions; only unknown keys
// are newly allowed.
import { z } from 'zod';

const T = z.ZodFirstPartyTypeKind;

function open(schema) {
  const def = schema?._def;
  switch (def?.typeName) {
    case T.ZodObject: {
      const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, open(v)]));
      return new z.ZodObject({ ...def, shape: () => shape, unknownKeys: 'passthrough' });
    }
    case T.ZodArray:
      return new z.ZodArray({ ...def, type: open(def.type) });
    case T.ZodOptional:
    case T.ZodNullable:
    case T.ZodDefault:
      return new schema.constructor({ ...def, innerType: open(def.innerType) });
    case T.ZodUnion:
    case T.ZodDiscriminatedUnion:
      return new schema.constructor({ ...def, options: def.options.map(open) });
    case T.ZodRecord:
      return new z.ZodRecord({ ...def, valueType: open(def.valueType) });
    default:
      return schema;
  }
}

/** @param {Record<string, import('zod').ZodTypeAny>} shape a registry outputSchema (raw zod shape) */
export function openOutputSchema(shape) {
  return open(z.object(shape));
}
