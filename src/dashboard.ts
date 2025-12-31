import {
  getDailySummary,
  getToolUsage,
  getTotalStats,
} from "./db.js";

const REFRESH_INTERVAL = 5000; // 5 seconds

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

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : " ".repeat(len - str.length) + str;
}

function clearScreen(): void {
  process.stdout.write("\x1B[2J\x1B[H");
}

function render(): void {
  const now = new Date();
  const start = getStartOfDay(now);
  const end = getEndOfDay(now);

  const daily = getDailySummary(start, end);
  const tools = getToolUsage(start, end);
  const totals = getTotalStats();
  const d = daily[0] || {
    sessions: 0,
    total_cost: 0,
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    tool_calls: 0,
    lines_added: 0,
    lines_removed: 0,
  };

  clearScreen();

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          CLAUDE CODE TELEMETRY - LIVE DASHBOARD              ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Last updated: ${now.toLocaleTimeString().padEnd(46)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Today's stats in a box
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│                        TODAY                                │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Cost: ${padLeft(formatCost(d.total_cost), 10)}     │  Sessions: ${padLeft(String(d.sessions), 6)}               │`);
  console.log(`│  Tokens: ${padLeft(formatTokens(d.total_tokens), 8)}     │  Tool Calls: ${padLeft(String(d.tool_calls), 4)}               │`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Input: ${padLeft(formatTokens(d.input_tokens), 9)}   Output: ${padLeft(formatTokens(d.output_tokens), 9)}   Cache: ${padLeft(formatTokens(d.cache_read_tokens), 8)} │`);
  console.log(`│  Lines: ${padLeft(`+${d.lines_added}`, 7)} / ${padLeft(`-${d.lines_removed}`, 6)}                                  │`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // All-time totals
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│                      ALL TIME                               │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Total Cost: ${padLeft(formatCost(totals.total_cost), 10)}    Total Tokens: ${padLeft(formatTokens(totals.total_tokens), 10)}     │`);
  console.log(`│  Total Sessions: ${padLeft(String(totals.total_sessions), 6)}                                       │`);
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");

  // Tool usage
  if (tools.length > 0) {
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│                   TODAY'S TOOL USAGE                        │");
    console.log("├─────────────────────────────────────────────────────────────┤");
    console.log(`│  ${padRight("Tool", 18)} ${padLeft("Calls", 7)} ${padLeft("OK", 6)} ${padLeft("Fail", 6)} ${padLeft("Avg", 10)}      │`);
    console.log("│  ───────────────────────────────────────────────────────    │");

    for (const tool of tools.slice(0, 6)) {
      const name = (tool.tool_name || "unknown").slice(0, 18);
      console.log(
        `│  ${padRight(name, 18)} ${padLeft(String(tool.total_calls), 7)} ${padLeft(String(tool.successful), 6)} ${padLeft(String(tool.failed), 6)} ${padLeft(formatDuration(tool.avg_duration_ms || 0), 10)}      │`
      );
    }
    console.log("└─────────────────────────────────────────────────────────────┘");
  } else {
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│  Waiting for telemetry data...                              │");
    console.log("│                                                             │");
    console.log("│  Make sure Claude Code is running with telemetry enabled.  │");
    console.log("└─────────────────────────────────────────────────────────────┘");
  }

  console.log("");
  console.log("  Press Ctrl+C to exit. Refreshing every 5 seconds...");
}

// Initial render
render();

// Refresh periodically
const interval = setInterval(render, REFRESH_INTERVAL);

// Handle exit
process.on("SIGINT", () => {
  clearInterval(interval);
  clearScreen();
  console.log("Dashboard closed.");
  process.exit(0);
});
