type Input = {
  text: string;
};

type Output = {
  upper: string;
  length: number;
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const input = JSON.parse(await readStdin()) as Input;
  const output: Output = {
    upper: input.text.toUpperCase(),
    length: input.text.length,
  };
  process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
