export interface MetricRecord {
  id?: number;
  timestamp: number;
  name: string;
  value: number;
  attributes: Record<string, string | number | boolean>;
}

export interface EventRecord {
  id?: number;
  timestamp: number;
  name: string;
  attributes: Record<string, string | number | boolean>;
}

export interface SessionSummary {
  session_id: string;
  start_time: number;
  end_time: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  tool_calls: number;
}

export interface DailySummary {
  date: string;
  sessions: number;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  tool_calls: number;
  lines_added: number;
  lines_removed: number;
}

export interface ToolUsage {
  tool_name: string;
  total_calls: number;
  successful: number;
  failed: number;
  avg_duration_ms: number;
}
