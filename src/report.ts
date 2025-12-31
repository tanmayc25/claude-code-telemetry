import {
  getDailySummary,
  getToolUsage,
  getSessionSummaries,
  getTotalStats,
  close,
} from "./db.js";

// Time range helpers
function getStartOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getEndOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function getStartOfWeek(date: Date): number {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStartOfMonth(date: Date): number {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Formatting helpers
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(Math.round(tokens));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : " ".repeat(len - str.length) + str;
}

// Report functions
function reportToday(): void {
  const now = new Date();
  const start = getStartOfDay(now);
  const end = getEndOfDay(now);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    TODAY'S USAGE SUMMARY                   ");
  console.log("═══════════════════════════════════════════════════════════\n");

  const daily = getDailySummary(start, end);
  const tools = getToolUsage(start, end);

  if (daily.length === 0) {
    console.log("  No telemetry data for today.\n");
    console.log("  Make sure the receiver is running and Claude Code is configured:\n");
    console.log("    export CLAUDE_CODE_ENABLE_TELEMETRY=1");
    console.log("    export OTEL_METRICS_EXPORTER=otlp");
    console.log("    export OTEL_LOGS_EXPORTER=otlp");
    console.log("    export OTEL_EXPORTER_OTLP_PROTOCOL=http/json");
    console.log("    export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318\n");
    return;
  }

  const d = daily[0];

  console.log("  TOKENS");
  console.log("  ───────────────────────────────────────");
  console.log(`  Input:      ${padLeft(formatTokens(d.input_tokens), 12)}`);
  console.log(`  Output:     ${padLeft(formatTokens(d.output_tokens), 12)}`);
  console.log(`  Cache Read: ${padLeft(formatTokens(d.cache_read_tokens), 12)}`);
  console.log(`  Total:      ${padLeft(formatTokens(d.total_tokens), 12)}`);
  console.log();

  console.log("  COST & ACTIVITY");
  console.log("  ───────────────────────────────────────");
  console.log(`  Cost:       ${padLeft(formatCost(d.total_cost), 12)}`);
  console.log(`  Sessions:   ${padLeft(String(d.sessions), 12)}`);
  console.log(`  Tool Calls: ${padLeft(String(d.tool_calls), 12)}`);
  console.log(`  Lines +/-:  ${padLeft(`+${d.lines_added} / -${d.lines_removed}`, 12)}`);
  console.log();

  if (tools.length > 0) {
    console.log("  TOP TOOLS");
    console.log("  ───────────────────────────────────────");
    console.log(`  ${padRight("Tool", 20)} ${padLeft("Calls", 8)} ${padLeft("Avg", 10)}`);
    for (const tool of tools.slice(0, 8)) {
      console.log(
        `  ${padRight(tool.tool_name || "unknown", 20)} ${padLeft(String(tool.total_calls), 8)} ${padLeft(formatDuration(tool.avg_duration_ms || 0), 10)}`
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

function reportWeek(): void {
  const now = new Date();
  const start = getStartOfWeek(now);
  const end = getEndOfDay(now);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                   THIS WEEK'S USAGE                        ");
  console.log("═══════════════════════════════════════════════════════════\n");

  const daily = getDailySummary(start, end);

  if (daily.length === 0) {
    console.log("  No telemetry data for this week.\n");
    return;
  }

  console.log(`  ${padRight("Date", 12)} ${padLeft("Cost", 10)} ${padLeft("Tokens", 10)} ${padLeft("Tools", 8)}`);
  console.log("  ─────────────────────────────────────────────────");

  let totalCost = 0;
  let totalTokens = 0;
  let totalTools = 0;

  for (const d of daily) {
    console.log(
      `  ${padRight(d.date, 12)} ${padLeft(formatCost(d.total_cost), 10)} ${padLeft(formatTokens(d.total_tokens), 10)} ${padLeft(String(d.tool_calls), 8)}`
    );
    totalCost += d.total_cost;
    totalTokens += d.total_tokens;
    totalTools += d.tool_calls;
  }

  console.log("  ─────────────────────────────────────────────────");
  console.log(
    `  ${padRight("TOTAL", 12)} ${padLeft(formatCost(totalCost), 10)} ${padLeft(formatTokens(totalTokens), 10)} ${padLeft(String(totalTools), 8)}`
  );
  console.log("\n═══════════════════════════════════════════════════════════\n");
}

function reportSessions(): void {
  const now = new Date();
  const start = getStartOfWeek(now);
  const end = getEndOfDay(now);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                   RECENT SESSIONS                          ");
  console.log("═══════════════════════════════════════════════════════════\n");

  const sessions = getSessionSummaries(start, end);

  if (sessions.length === 0) {
    console.log("  No sessions found this week.\n");
    return;
  }

  for (const s of sessions.slice(0, 10)) {
    const duration = Math.round((s.end_time - s.start_time) / 1000 / 60);
    console.log(`  Session: ${s.session_id.slice(0, 8)}...`);
    console.log(`    Started:  ${formatTimestamp(s.start_time)}`);
    console.log(`    Duration: ~${duration} min`);
    console.log(`    Cost:     ${formatCost(s.total_cost)}`);
    console.log(`    Tokens:   ${formatTokens(s.total_input_tokens + s.total_output_tokens)} (in: ${formatTokens(s.total_input_tokens)}, out: ${formatTokens(s.total_output_tokens)})`);
    console.log(`    Tools:    ${s.tool_calls} calls`);
    console.log();
  }

  console.log("═══════════════════════════════════════════════════════════\n");
}

function reportTotal(): void {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                   ALL-TIME TOTALS                          ");
  console.log("═══════════════════════════════════════════════════════════\n");

  const stats = getTotalStats();

  console.log(`  Total Cost:     ${formatCost(stats.total_cost)}`);
  console.log(`  Total Tokens:   ${formatTokens(stats.total_tokens)}`);
  console.log(`  Total Sessions: ${stats.total_sessions}`);

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

function reportTools(): void {
  const now = new Date();
  const start = getStartOfMonth(now);
  const end = getEndOfDay(now);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                   TOOL USAGE (This Month)                  ");
  console.log("═══════════════════════════════════════════════════════════\n");

  const tools = getToolUsage(start, end);

  if (tools.length === 0) {
    console.log("  No tool usage data found.\n");
    return;
  }

  console.log(`  ${padRight("Tool", 20)} ${padLeft("Total", 8)} ${padLeft("OK", 6)} ${padLeft("Fail", 6)} ${padLeft("Avg", 10)}`);
  console.log("  ─────────────────────────────────────────────────────────");

  for (const tool of tools) {
    console.log(
      `  ${padRight(tool.tool_name || "unknown", 20)} ${padLeft(String(tool.total_calls), 8)} ${padLeft(String(tool.successful), 6)} ${padLeft(String(tool.failed), 6)} ${padLeft(formatDuration(tool.avg_duration_ms || 0), 10)}`
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

function printHelp(): void {
  console.log(`
Claude Code Telemetry Reporter

Usage: npm run report [command]

Commands:
  today     Show today's usage summary (default)
  week      Show this week's daily breakdown
  sessions  List recent sessions with details
  tools     Show tool usage statistics
  total     Show all-time totals
  help      Show this help message

Examples:
  npm run report today
  npm run report week
  npm run report sessions
`);
}

// Main
const command = process.argv[2] || "today";

try {
  switch (command) {
    case "today":
      reportToday();
      break;
    case "week":
      reportWeek();
      break;
    case "sessions":
      reportSessions();
      break;
    case "tools":
      reportTools();
      break;
    case "total":
      reportTotal();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
} finally {
  close();
}
