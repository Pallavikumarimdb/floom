const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

async function main() {
  const serverDir = join(process.cwd(), ".next", "server");
  await mkdir(serverDir, { recursive: true });
  await writeFile(join(serverDir, "package.json"), '{"type":"commonjs"}\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
