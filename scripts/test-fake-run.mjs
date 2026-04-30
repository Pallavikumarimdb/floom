// Test script that exercises the fake-mode runner locally
import { runInSandbox } from '../src/lib/runner.ts';
import { parseManifest, isSafePythonEntrypoint } from '../src/lib/manifest.ts';

async function test() {
  if (isSafePythonEntrypoint('my-app.py')) {
    throw new Error('hyphenated Python entrypoint accepted');
  }
  if (!isSafePythonEntrypoint('app.py')) {
    throw new Error('valid Python entrypoint rejected');
  }
  try {
    parseManifest({ name: 'Bad', slug: 'bad-app', runtime: 'python', entrypoint: 'my-app.py', handler: 'run' });
    throw new Error('invalid manifest accepted');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('entrypoint')) throw error;
  }
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
