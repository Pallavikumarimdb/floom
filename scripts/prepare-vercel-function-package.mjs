import { readFile, writeFile } from "node:fs/promises";

if (process.env.VERCEL === "1") {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.type = "commonjs";
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log("Prepared Vercel function package scope as CommonJS.");
}
