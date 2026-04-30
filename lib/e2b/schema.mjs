function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function allowsType(expected, actual) {
  if (Array.isArray(expected)) return expected.includes(actual);
  if (expected === "number") return actual === "number" || actual === "integer";
  return expected === actual;
}

export function validateJsonSchema(schema, value, path = "$") {
  const errors = [];
  visit(schema, value, path, errors);
  return errors;
}

export function assertJsonSchema(schema, value, label = "value") {
  const errors = validateJsonSchema(schema, value);
  if (errors.length > 0) {
    throw new Error(`${label} failed schema validation: ${errors.join("; ")}`);
  }
}

function visit(schema, value, path, errors) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    errors.push(`${path}: schema must be an object`);
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    errors.push(`${path}: expected one of ${JSON.stringify(schema.enum)}`);
  }

  if (schema.type && !allowsType(schema.type, typeOf(value))) {
    errors.push(`${path}: expected ${JSON.stringify(schema.type)}, got ${typeOf(value)}`);
    return;
  }

  if (schema.type === "object" || schema.properties || schema.required) {
    validateObject(schema, value, path, errors);
  }

  if (schema.type === "array" || schema.items) {
    validateArray(schema, value, path, errors);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: greater than maximum ${schema.maximum}`);
    }
  }
}

function validateObject(schema, value, path, errors) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path}: expected object`);
    return;
  }

  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key}: required property missing`);
    }
  }

  const properties = schema.properties ?? {};
  for (const [key, childSchema] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      visit(childSchema, value[key], `${path}.${key}`, errors);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        errors.push(`${path}.${key}: additional property not allowed`);
      }
    }
  }
}

function validateArray(schema, value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return;
  }

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(`${path}: fewer than minItems ${schema.minItems}`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(`${path}: more than maxItems ${schema.maxItems}`);
  }

  if (schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      visit(schema.items, value[index], `${path}[${index}]`, errors);
    }
  }
}

export function exampleFromSchema(schema) {
  if (schema.example !== undefined) return schema.example;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];

  switch (Array.isArray(schema.type) ? schema.type[0] : schema.type) {
    case "object": {
      const value = {};
      for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
        value[key] = exampleFromSchema(childSchema);
      }
      return value;
    }
    case "array":
      return schema.items ? [exampleFromSchema(schema.items)] : [];
    case "integer":
      return schema.minimum ?? 0;
    case "number":
      return schema.minimum ?? 0;
    case "boolean":
      return true;
    case "null":
      return null;
    case "string":
    default:
      return "example";
  }
}
