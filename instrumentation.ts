import { assertRuntimeConfig, env } from './src/lib/env';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const problems = assertRuntimeConfig();
  if (problems.length > 0) {
    console.warn('[callaudit] configuration problems:', problems.join(' '));
  }

  const [{ ensureStorageDir }, { resumePendingWork, startWorker }] = await Promise.all([
    import('./src/lib/storage'),
    import('./src/server/queue')
  ]);

  await ensureStorageDir();
  if (env.workerEnabled) {
    startWorker();
    const { requeued } = await resumePendingWork();
    if (requeued > 0) console.info(`[callaudit] re-queued ${requeued} unfinished call job(s)`);
  }
}
