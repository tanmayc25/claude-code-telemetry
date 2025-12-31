# claude-code-telemetry

Lightweight local telemetry tracker for Claude Code. Captures usage metrics (tokens, cost, tool calls) and stores them in SQLite for easy querying.

## Setup

```bash
./setup.sh
```

This installs dependencies, configures environment variables, and starts the receiver.

### Manual Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Add to your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   export CLAUDE_CODE_ENABLE_TELEMETRY=1
   export OTEL_METRICS_EXPORTER=otlp
   export OTEL_LOGS_EXPORTER=otlp
   export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
   export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```

3. Reload your shell:
   ```bash
   source ~/.zshrc
   ```

## Usage

Single command to start tracking with live dashboard:
```bash
npm start
```

This runs the receiver in the background and shows a live dashboard that updates every 5 seconds. Press Ctrl+C to stop.

Generate reports:
```bash
npm run report today      # Today's summary
npm run report week       # This week's breakdown
npm run report sessions   # Recent sessions
npm run report tools      # Tool usage stats
npm run report total      # All-time totals
```

## What's Tracked

| Metric | Description |
|--------|-------------|
| Tokens | Input, output, cache read |
| Cost | USD per session/day |
| Tools | Calls, success rates, durations |
| Code | Lines added/removed |
| Sessions | Start time, duration, activity |

## How It Works

Claude Code has built-in OpenTelemetry support. This project runs a minimal OTLP HTTP receiver that:

1. Listens on `localhost:4318` for telemetry data
2. Parses metrics and events from Claude Code
3. Stores everything in a local SQLite database (`telemetry.db`)
4. Provides CLI tools to query and visualize the data

## Project Structure

```
claude-code-telemetry/
├── src/
│   ├── start.ts       # Combined entry point
│   ├── server.ts      # OTLP HTTP receiver
│   ├── dashboard.ts   # Live dashboard
│   ├── db.ts          # SQLite storage and queries
│   ├── report.ts      # CLI reporter
│   └── types.ts       # TypeScript types
├── setup.sh           # One-command setup
├── telemetry.db       # SQLite database (auto-created)
└── package.json
```

## Auto-Start on Login (macOS)

To run the telemetry server automatically on login, create a LaunchAgent:

1. Create the plist file:
   ```bash
   nano ~/Library/LaunchAgents/com.claude-code-telemetry.plist
   ```

2. Add this content (update the `WorkingDirectory` path):
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.claude-code-telemetry</string>
       <key>ProgramArguments</key>
       <array>
           <string>/opt/homebrew/bin/npm</string>
           <string>run</string>
           <string>server</string>
       </array>
       <key>WorkingDirectory</key>
       <string>/path/to/claude-code-telemetry</string>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
   </dict>
   </plist>
   ```

3. Load it:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.claude-code-telemetry.plist
   ```

4. Manage the service:
   ```bash
   # Stop
   launchctl unload ~/Library/LaunchAgents/com.claude-code-telemetry.plist

   # Start
   launchctl load ~/Library/LaunchAgents/com.claude-code-telemetry.plist

   # Check status
   launchctl list | grep claude
   ```

## Requirements

- Node.js 18+
- Claude Code with telemetry enabled

## License

MIT
