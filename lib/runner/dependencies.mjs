import path from "node:path";
import { existsSync } from "node:fs";

const PYTHON_DEPENDENCY_FILE = "requirements.txt";
const NODE_DEPENDENCY_FILE = "package.json";

export function getDependencyInstallCommands(bundle) {
  const commands = [];
  const kind = bundle.manifest?.runtime?.kind;

  if (kind === "python" && hasBundleFile(bundle, PYTHON_DEPENDENCY_FILE)) {
    commands.push(
      "python3 -m venv .floom-venv && . .floom-venv/bin/activate && python3 -m pip install -r requirements.txt",
    );
  }

  if ((kind === "node" || kind === "typescript") && hasBundleFile(bundle, NODE_DEPENDENCY_FILE)) {
    commands.push("npm install");
  }

  return commands;
}

export function getDependencyRuntimeCommand(bundle, command = bundle.manifest.runtime.command) {
  const kind = bundle.manifest?.runtime?.kind;
  if (kind === "python" && hasBundleFile(bundle, PYTHON_DEPENDENCY_FILE)) {
    return `PATH=.floom-venv/bin:$PATH ${command}`;
  }
  return command;
}

export async function runDependencyInstallCommands(bundle, runCommand) {
  for (const command of getDependencyInstallCommands(bundle)) {
    const result = await runCommand(command);
    if (result.exitCode !== 0) {
      return { command, result };
    }
  }

  return null;
}

function hasBundleFile(bundle, fileName) {
  return existsSync(path.join(bundle.rootDir, fileName));
}
