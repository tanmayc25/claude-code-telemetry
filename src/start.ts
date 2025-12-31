import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let server: ChildProcess | null = null;

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    server.stdout?.once("data", () => {
      // Server is ready when it starts outputting
      resolve();
    });

    server.stderr?.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("EADDRINUSE")) {
        console.log("Server already running on port 4318");
        resolve();
      }
    });

    // Resolve after timeout if no output
    setTimeout(resolve, 2000);
  });
}

function cleanup(): void {
  if (server) {
    server.kill();
    server = null;
  }
}

// Handle exit
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

// Start server, then import and run dashboard
async function main(): Promise<void> {
  console.log("Starting telemetry receiver...");
  await startServer();
  console.log("Receiver running on http://localhost:4318\n");

  // Dynamic import to run dashboard
  await import("./dashboard.js");
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
