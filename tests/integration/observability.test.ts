import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { log, stage, startTelemetry } from '@prism/observability';
it('exports stage traces, metrics and logs to an OTLP HTTP collector', async () => {
  const paths = new Set<string>();
  const server = createServer((request, response) => { paths.add(request.url ?? ''); request.resume(); request.on('end', () => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}'); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No collector port');
  const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${address.port}`;
  const sdk = startTelemetry('prism-telemetry-test');
  try { await stage('test-analysis-stage', async () => { log('test_analysis_complete', { result: 'BLOCK' }); }); await sdk?.shutdown(); expect(paths).toEqual(new Set(['/v1/traces', '/v1/metrics', '/v1/logs'])); }
  finally { if (previous === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT; else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
