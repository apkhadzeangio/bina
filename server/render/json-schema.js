// A small JSON Schema (draft-07) validator for the keywords the BINA scene schema uses.
//
// Cloudflare Workers do not allow code generation (eval / new Function), which is how
// general validators such as Ajv compile schemas, so the render server interprets the
// schema directly. Supported: type, enum, const, properties, required,
// additionalProperties, items, minItems, maxItems, minimum, maximum, exclusiveMinimum,
// exclusiveMaximum, minLength, maxLength, pattern, anyOf, allOf, oneOf, not, if/then/else
// and local $ref ("#/..."). An unknown keyword is a programming error and throws, so the
// schema can never be silently checked less strictly than its author intended.
// test/render-scene.test.js compares the results with Ajv.

const KNOWN = new Set([
  '$schema', '$id', '$defs', 'definitions', 'title', 'description', '$comment', 'default', 'examples',
  'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern',
  'anyOf', 'allOf', 'oneOf', 'not', 'if', 'then', 'else', '$ref',
]);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function hasType(v, t) {
  const actual = typeOf(v);
  return t === actual || (t === 'number' && actual === 'integer');
}

function equal(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || !a || !b || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => equal(a[k], b[k]));
}

function resolve(root, ref) {
  if (!ref.startsWith('#')) throw new Error(`Only local $ref is supported: ${ref}`);
  let node = root;
  for (const raw of ref.slice(1).split('/').filter(Boolean)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[key];
    if (node === undefined) throw new Error(`Unresolved $ref ${ref}`);
  }
  return node;
}

export function compileSchema(root) {
  const patterns = new Map();
  const regex = (p) => {
    if (!patterns.has(p)) patterns.set(p, new RegExp(p, 'u'));
    return patterns.get(p);
  };

  function check(schema, value, path, errors, budget) {
    if (budget.left-- <= 0) throw new Error('schema check budget exceeded');
    if (schema === true) return;
    if (schema === false) {
      errors.push(`${path || '/'}: not allowed`);
      return;
    }
    for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`Unsupported schema keyword ${k}`);
    const err = (msg) => errors.push(`${path || '/'}: ${msg}`);
    const sub = (s, v, p) => {
      const e = [];
      check(s, v, p, e, budget);
      return e;
    };

    if (schema.$ref) check(resolve(root, schema.$ref), value, path, errors, budget);
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t) => hasType(value, t))) {
        err(`expected ${types.join('|')}`);
        return; // the other keywords assume the type
      }
    }
    if (schema.enum && !schema.enum.some((x) => equal(x, value))) err('not one of the allowed values');
    if ('const' in schema && !equal(schema.const, value)) err('not the required value');

    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) err(`below ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) err(`above ${schema.maximum}`);
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) err(`not above ${schema.exclusiveMinimum}`);
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) err(`not below ${schema.exclusiveMaximum}`);
    }
    if (typeof value === 'string') {
      const len = [...value].length; // code points, as JSON Schema counts them
      if (schema.minLength !== undefined && len < schema.minLength) err('too short');
      if (schema.maxLength !== undefined && len > schema.maxLength) err('too long');
      if (schema.pattern !== undefined && !regex(schema.pattern).test(value)) err('does not match the pattern');
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) err('too few items');
      if (schema.maxItems !== undefined && value.length > schema.maxItems) err('too many items');
      if (isObj(schema.items) || typeof schema.items === 'boolean') value.forEach((v, i) => check(schema.items, v, `${path}/${i}`, errors, budget));
      else if (Array.isArray(schema.items)) throw new Error('Tuple items are not supported');
    }
    if (isObj(value)) {
      const props = schema.properties || {};
      for (const k of schema.required || []) if (!(k in value)) err(`missing ${k}`);
      for (const [k, v] of Object.entries(value)) {
        if (k in props) check(props[k], v, `${path}/${k}`, errors, budget);
        else if (schema.additionalProperties === false) err(`unexpected property ${k}`);
        else if (isObj(schema.additionalProperties)) check(schema.additionalProperties, v, `${path}/${k}`, errors, budget);
      }
    }
    if (schema.allOf) for (const s of schema.allOf) check(s, value, path, errors, budget);
    if (schema.anyOf && !schema.anyOf.some((s) => sub(s, value, path).length === 0)) err('matches none of the alternatives');
    if (schema.oneOf && schema.oneOf.filter((s) => sub(s, value, path).length === 0).length !== 1) err('must match exactly one alternative');
    if (schema.not && sub(schema.not, value, path).length === 0) err('matches a forbidden form');
    if (schema.if) {
      const ok = sub(schema.if, value, path).length === 0;
      if (ok && schema.then) check(schema.then, value, path, errors, budget);
      if (!ok && schema.else) check(schema.else, value, path, errors, budget);
    }
  }

  // Returns the list of problems (empty = valid). `maxSteps` bounds the work per value.
  return function validate(value, { maxSteps = 200000 } = {}) {
    const errors = [];
    check(root, value, '', errors, { left: maxSteps });
    return errors;
  };
}
