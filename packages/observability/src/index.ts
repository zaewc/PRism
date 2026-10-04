import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

const tracer = trace.getTracer('prism', '0.1.0');
export async function stage<T>(name: string, execute: () => Promise<T> | T): Promise<T> {
  // Obtain instruments after the SDK is initialized; pre-SDK meters can remain no-op.
  const meter = metrics.getMeter('prism', '0.1.0');
  const stageDuration = meter.createHistogram('prism.stage.duration', { unit: 'ms' });
  const failures = meter.createCounter('prism.stage.failures');
  return tracer.startActiveSpan(name, async span => {
    const start = performance.now();
    try { const result = await execute(); span.setStatus({ code: SpanStatusCode.OK }); return result; }
    catch (error) { failures.add(1, { stage: name }); span.setStatus({ code: SpanStatusCode.ERROR, message: 'stage failed' }); throw error; }
    finally { stageDuration.record(performance.now() - start, { stage: name }); span.end(); }
  });
}
export function log(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  // Accept structured scalar fields only. Never attach tokens, source, request body or raw exceptions.
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields, traceId: trace.getActiveSpan()?.spanContext().traceId ?? null }) + '\n');
  const attributes = Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string | number | boolean] => entry[1] !== null));
  logs.getLogger('prism').emit({ body: event, severityNumber: SeverityNumber.INFO, attributes });
}
export function startTelemetry(serviceName: string): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;
  const url = endpoint.replace(/\/$/, '');
  const sdk = new NodeSDK({ serviceName, traceExporter: new OTLPTraceExporter({ url: `${url}/v1/traces` }), metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${url}/v1/metrics` }), exportIntervalMillis: 15_000 })], logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${url}/v1/logs` }) })] });
  sdk.start();
  return sdk;
}
