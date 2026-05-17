import { defineConfig } from "@trigger.dev/sdk/v3";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import * as dotenv from "dotenv";

dotenv.config();

const TRIGGER_RUNTIME_ENV_VARS = [
  "MONGODB_URI",
  "MONGODB_DB_NAME",
  "PORTKEY_AI_KEY",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
] as const;

export default defineConfig({
  project: "proj_akulfxhttrtcetbyjbym",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [
      syncEnvVars(() => {
        return Object.fromEntries(
          TRIGGER_RUNTIME_ENV_VARS
            .map((name) => [name, process.env[name]])
            .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
        );
      }),
    ],
  },
  dirs: ["src/trigger"],
});
