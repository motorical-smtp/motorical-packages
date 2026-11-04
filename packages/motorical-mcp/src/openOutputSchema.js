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

// zod 4 keeps a schema's description in a registry keyed by instance, so a rebuilt schema must carry it over.
const withMeta = (rebuilt, original) => (original.description ? rebuilt.describe(original.description) : rebuilt);

function open(schema) {
  const def = schema?._zod?.def;
  switch (def?.type) {
    case 'object': {
      const shape = Object.fromEntries(Object.entries(def.shape).map(([k, v]) => [k, open(v)]));
      return withMeta(z.looseObject(shape), schema);
    }
    case 'array':
      return withMeta(z.array(open(def.element)), schema);
    case 'optional':
    case 'nullable':
    case 'default':
      return withMeta(schema.clone({ ...def, innerType: open(def.innerType) }), schema);
    case 'union':
      return withMeta(schema.clone({ ...def, options: def.options.map(open) }), schema);
    case 'record':
      return withMeta(schema.clone({ ...def, valueType: open(def.valueType) }), schema);
    default:
      return schema;
  }
}

/** @param {Record<string, import('zod').ZodTypeAny>} shape a registry outputSchema (raw zod shape) */
export function openOutputSchema(shape) {
  return open(z.object(shape));
}
