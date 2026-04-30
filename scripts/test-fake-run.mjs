// Test script that exercises the fake-mode runner locally
import { runInSandbox } from '../src/lib/runner.ts';

async function test() {
  const result = await runInSandbox(
    'def run(inputs): return {"result": "hello"}',
    { name: 'Floom' },
    'python',
    'app.py',
    'run',
    { python: [] }
  );

  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.output?.result === 'hello from fake mode') {
    console.log('✅ Fake mode works');
  } else {
    console.log('❌ Unexpected output');
    process.exit(1);
  }
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
