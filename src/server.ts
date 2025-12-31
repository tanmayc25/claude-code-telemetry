import Fastify from "fastify";
import { insertMetric, insertEvent } from "./db.js";

const fastify = Fastify({ logger: false });

// OTLP JSON format types (simplified)
interface OtlpMetricsPayload {
  resourceMetrics?: Array<{
    resource?: { attributes?: Array<{ key: string; value: any }> };
    scopeMetrics?: Array<{
      metrics?: Array<{
        name: string;
        sum?: { dataPoints?: Array<DataPoint> };
        gauge?: { dataPoints?: Array<DataPoint> };
        histogram?: { dataPoints?: Array<DataPoint> };
      }>;
    }>;
  }>;
}

interface DataPoint {
  timeUnixNano?: string;
  asDouble?: number;
  asInt?: string;
  attributes?: Array<{ key: string; value: any }>;
}

interface OtlpLogsPayload {
  resourceLogs?: Array<{
    resource?: { attributes?: Array<{ key: string; value: any }> };
    scopeLogs?: Array<{
      logRecords?: Array<{
        timeUnixNano?: string;
        body?: { stringValue?: string };
        attributes?: Array<{ key: string; value: any }>;
      }>;
    }>;
  }>;
}

function extractValue(v: any): string | number | boolean {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return parseInt(v.intValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  return String(v);
}

function attrsToObject(
  attrs?: Array<{ key: string; value: any }>
): Record<string, string | number | boolean> {
  if (!attrs) return {};
  const obj: Record<string, string | number | boolean> = {};
  for (const attr of attrs) {
    obj[attr.key] = extractValue(attr.value);
  }
  return obj;
}

// Metrics endpoint
fastify.post("/v1/metrics", async (request, reply) => {
  try {
    const payload = request.body as OtlpMetricsPayload;
    let count = 0;

    for (const rm of payload.resourceMetrics || []) {
      const resourceAttrs = attrsToObject(rm.resource?.attributes);

      for (const sm of rm.scopeMetrics || []) {
        for (const metric of sm.metrics || []) {
          const dataPoints =
            metric.sum?.dataPoints ||
            metric.gauge?.dataPoints ||
            metric.histogram?.dataPoints ||
            [];

          for (const dp of dataPoints) {
            const timestamp = dp.timeUnixNano
              ? Math.floor(parseInt(dp.timeUnixNano, 10) / 1_000_000)
              : Date.now();

            const value =
              dp.asDouble ?? (dp.asInt ? parseInt(dp.asInt, 10) : 0);

            const attributes = {
              ...resourceAttrs,
              ...attrsToObject(dp.attributes),
            };

            insertMetric({
              timestamp,
              name: metric.name,
              value,
              attributes,
            });
            count++;
          }
        }
      }
    }

    console.log(`[metrics] Received ${count} data points`);
    return { status: "ok", count };
  } catch (err) {
    console.error("[metrics] Error:", err);
    return reply.status(400).send({ error: String(err) });
  }
});

// Logs/Events endpoint
fastify.post("/v1/logs", async (request, reply) => {
  try {
    const payload = request.body as OtlpLogsPayload;
    let count = 0;

    for (const rl of payload.resourceLogs || []) {
      const resourceAttrs = attrsToObject(rl.resource?.attributes);

      for (const sl of rl.scopeLogs || []) {
        for (const log of sl.logRecords || []) {
          const timestamp = log.timeUnixNano
            ? Math.floor(parseInt(log.timeUnixNano, 10) / 1_000_000)
            : Date.now();

          const attributes = {
            ...resourceAttrs,
            ...attrsToObject(log.attributes),
          };

          const eventName =
            (attributes["event.name"] as string) ||
            log.body?.stringValue ||
            "unknown";

          insertEvent({
            timestamp,
            name: eventName,
            attributes,
          });
          count++;
        }
      }
    }

    console.log(`[events] Received ${count} log records`);
    return { status: "ok", count };
  } catch (err) {
    console.error("[events] Error:", err);
    return reply.status(400).send({ error: String(err) });
  }
});

// Health check
fastify.get("/health", async () => {
  return { status: "ok" };
});

// Start server
const PORT = parseInt(process.env.PORT || "4318", 10);

fastify.listen({ port: PORT, host: "127.0.0.1" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         Claude Code Telemetry Receiver                     ║
╠════════════════════════════════════════════════════════════╣
║  Listening on: ${address.padEnd(41)}║
║                                                            ║
║  Configure Claude Code with:                               ║
║    export CLAUDE_CODE_ENABLE_TELEMETRY=1                   ║
║    export OTEL_METRICS_EXPORTER=otlp                       ║
║    export OTEL_LOGS_EXPORTER=otlp                          ║
║    export OTEL_EXPORTER_OTLP_PROTOCOL=http/json            ║
║    export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318║
╚════════════════════════════════════════════════════════════╝
  `);
});
