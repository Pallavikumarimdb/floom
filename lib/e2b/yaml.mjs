const INDENT = 2;

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseYamlDocument(source) {
  const root = {};
  const stack = [{ indent: -INDENT, value: root }];
  const lines = source.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;

    const indent = rawLine.match(/^ */)[0].length;
    if (indent % INDENT !== 0) {
      throw new Error(`Invalid indentation at line ${lineNumber + 1}`);
    }

    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`Unsupported YAML syntax at line ${lineNumber + 1}`);
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    const key = match[1];
    const value = match[2] ?? "";

    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`Duplicate YAML key "${key}" at line ${lineNumber + 1}`);
    }

    if (value === "") {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
    } else {
      parent[key] = scalar(value);
    }
  }

  return root;
}
