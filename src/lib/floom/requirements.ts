import { MAX_REQUIREMENTS_BYTES } from "./limits";

const UNSAFE_REQUIREMENT = /(^\s*-)|:\/\/|(^|\s)(git\+|file:|\.{1,2}\/)/i;
const HASHED_EXACT_PINNED_REQUIREMENT_LINE =
  /^[A-Za-z0-9_.-]+(\[[A-Za-z0-9_,.-]+\])?==[A-Za-z0-9_.!+-]+(\s+--hash=sha256:[a-f0-9]{64})+$/i;

export type RuntimeDependencies = {
  python_requirements?: string;
};

export function validatePythonRequirementsText(text: string): string {
  if (Buffer.byteLength(text, "utf8") > MAX_REQUIREMENTS_BYTES) {
    throw new Error("requirements.txt is too large");
  }

  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  if (normalizedLines.length === 0) {
    throw new Error("requirements.txt must contain at least one package");
  }

  if (normalizedLines.length > 50) {
    throw new Error("requirements.txt supports at most 50 packages");
  }

  for (const line of normalizedLines) {
    if (UNSAFE_REQUIREMENT.test(line) || !HASHED_EXACT_PINNED_REQUIREMENT_LINE.test(line)) {
      throw new Error("requirements.txt only supports exact package pins with sha256 hashes like package==1.2.3 --hash=sha256:<64 hex>");
    }
  }

  return `${normalizedLines.join("\n")}\n`;
}

export function readRuntimeDependencies(value: unknown): RuntimeDependencies {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const pythonRequirements = (value as Record<string, unknown>).python_requirements;
  if (typeof pythonRequirements !== "string" || pythonRequirements.trim() === "") {
    return {};
  }

  return { python_requirements: validatePythonRequirementsText(pythonRequirements) };
}
