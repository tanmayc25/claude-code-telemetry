import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type {
  MetricRecord,
  EventRecord,
  DailySummary,
  SessionSummary,
  ToolUsage,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "telemetry.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    name TEXT NOT NULL,
    value REAL NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    name TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
  CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
`);

// Insert functions
export function insertMetric(metric: MetricRecord): void {
  const stmt = db.prepare(`
    INSERT INTO metrics (timestamp, name, value, attributes)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(
    metric.timestamp,
    metric.name,
    metric.value,
    JSON.stringify(metric.attributes)
  );
}

export function insertEvent(event: EventRecord): void {
  const stmt = db.prepare(`
    INSERT INTO events (timestamp, name, attributes)
    VALUES (?, ?, ?)
  `);
  stmt.run(event.timestamp, event.name, JSON.stringify(event.attributes));
}

// Query functions
export function getDailySummary(startTs: number, endTs: number): DailySummary[] {
  const stmt = db.prepare(`
    SELECT
      date(timestamp / 1000, 'unixepoch', 'localtime') as date,
      COUNT(DISTINCT json_extract(attributes, '$.session_id')) as sessions,
      SUM(CASE WHEN name = 'claude_code.cost.usage' THEN value ELSE 0 END) as total_cost,
      SUM(CASE WHEN name = 'claude_code.token.usage' THEN value ELSE 0 END) as total_tokens,
      SUM(CASE WHEN name = 'claude_code.token.usage' AND json_extract(attributes, '$.type') = 'input' THEN value ELSE 0 END) as input_tokens,
      SUM(CASE WHEN name = 'claude_code.token.usage' AND json_extract(attributes, '$.type') = 'output' THEN value ELSE 0 END) as output_tokens,
      SUM(CASE WHEN name = 'claude_code.token.usage' AND json_extract(attributes, '$.type') = 'cacheRead' THEN value ELSE 0 END) as cache_read_tokens,
      SUM(CASE WHEN name = 'claude_code.lines_of_code.count' AND json_extract(attributes, '$.type') = 'added' THEN value ELSE 0 END) as lines_added,
      SUM(CASE WHEN name = 'claude_code.lines_of_code.count' AND json_extract(attributes, '$.type') = 'removed' THEN value ELSE 0 END) as lines_removed
    FROM metrics
    WHERE timestamp >= ? AND timestamp < ?
    GROUP BY date
    ORDER BY date DESC
  `);

  const metricsRows = stmt.all(startTs, endTs) as any[];

  // Get tool calls from events
  const toolStmt = db.prepare(`
    SELECT
      date(timestamp / 1000, 'unixepoch', 'localtime') as date,
      COUNT(*) as tool_calls
    FROM events
    WHERE name = 'claude_code.tool_result' AND timestamp >= ? AND timestamp < ?
    GROUP BY date
  `);
  const toolRows = toolStmt.all(startTs, endTs) as any[];
  const toolByDate = new Map(toolRows.map((r) => [r.date, r.tool_calls]));

  return metricsRows.map((row) => ({
    date: row.date,
    sessions: row.sessions || 0,
    total_cost: row.total_cost || 0,
    total_tokens: row.total_tokens || 0,
    input_tokens: row.input_tokens || 0,
    output_tokens: row.output_tokens || 0,
    cache_read_tokens: row.cache_read_tokens || 0,
    tool_calls: toolByDate.get(row.date) || 0,
    lines_added: row.lines_added || 0,
    lines_removed: row.lines_removed || 0,
  }));
}

export function getToolUsage(startTs: number, endTs: number): ToolUsage[] {
  const stmt = db.prepare(`
    SELECT
      json_extract(attributes, '$.tool_name') as tool_name,
      COUNT(*) as total_calls,
      SUM(CASE WHEN json_extract(attributes, '$.success') = 'true' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN json_extract(attributes, '$.success') = 'false' THEN 1 ELSE 0 END) as failed,
      AVG(CAST(json_extract(attributes, '$.duration_ms') AS REAL)) as avg_duration_ms
    FROM events
    WHERE name = 'claude_code.tool_result' AND timestamp >= ? AND timestamp < ?
    GROUP BY tool_name
    ORDER BY total_calls DESC
  `);

  return stmt.all(startTs, endTs) as ToolUsage[];
}

export function getSessionSummaries(
  startTs: number,
  endTs: number
): SessionSummary[] {
  const stmt = db.prepare(`
    SELECT
      json_extract(attributes, '$.session_id') as session_id,
      MIN(timestamp) as start_time,
      MAX(timestamp) as end_time,
      SUM(CASE WHEN name = 'claude_code.cost.usage' THEN value ELSE 0 END) as total_cost,
      SUM(CASE WHEN name = 'claude_code.token.usage' AND json_extract(attributes, '$.type') = 'input' THEN value ELSE 0 END) as total_input_tokens,
      SUM(CASE WHEN name = 'claude_code.token.usage' AND json_extract(attributes, '$.type') = 'output' THEN value ELSE 0 END) as total_output_tokens,
      SUM(CASE WHEN name = 'claude_code.token.usage' AND json_extract(attributes, '$.type') = 'cacheRead' THEN value ELSE 0 END) as total_cache_read_tokens
    FROM metrics
    WHERE timestamp >= ? AND timestamp < ?
    GROUP BY session_id
    ORDER BY start_time DESC
  `);

  const rows = stmt.all(startTs, endTs) as any[];

  // Get tool call counts per session
  const toolStmt = db.prepare(`
    SELECT
      json_extract(attributes, '$.session_id') as session_id,
      COUNT(*) as tool_calls
    FROM events
    WHERE name = 'claude_code.tool_result' AND timestamp >= ? AND timestamp < ?
    GROUP BY session_id
  `);
  const toolRows = toolStmt.all(startTs, endTs) as any[];
  const toolBySession = new Map(
    toolRows.map((r) => [r.session_id, r.tool_calls])
  );

  return rows.map((row) => ({
    session_id: row.session_id || "unknown",
    start_time: row.start_time,
    end_time: row.end_time,
    total_cost: row.total_cost || 0,
    total_input_tokens: row.total_input_tokens || 0,
    total_output_tokens: row.total_output_tokens || 0,
    total_cache_read_tokens: row.total_cache_read_tokens || 0,
    tool_calls: toolBySession.get(row.session_id) || 0,
  }));
}

export function getTotalStats(): {
  total_cost: number;
  total_tokens: number;
  total_sessions: number;
} {
  const costStmt = db.prepare(`
    SELECT SUM(value) as total FROM metrics WHERE name = 'claude_code.cost.usage'
  `);
  const tokenStmt = db.prepare(`
    SELECT SUM(value) as total FROM metrics WHERE name = 'claude_code.token.usage'
  `);
  const sessionStmt = db.prepare(`
    SELECT COUNT(DISTINCT json_extract(attributes, '$.session_id')) as total FROM metrics
  `);

  return {
    total_cost: (costStmt.get() as any)?.total || 0,
    total_tokens: (tokenStmt.get() as any)?.total || 0,
    total_sessions: (sessionStmt.get() as any)?.total || 0,
  };
}

export function close(): void {
  db.close();
}
