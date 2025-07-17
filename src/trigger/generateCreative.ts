import { logger, task } from "@trigger.dev/sdk/v3";
import { ExampleTaskInput } from "@/types";

export const generateCreativeTask = task({
  id: "example-task",
  // Set an optional maxDuration to prevent tasks from running indefinitely
  maxDuration: 600, // Stop executing after 300 secs (5 mins) of compute,
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: ExampleTaskInput, { ctx }) => {
    logger.log("[EXAMPLE-TASK] Started", { payload, ctx });

    console.log("Example task triggered with payload:", payload);

    return {
      message: "Example task completed successfully",
    }
  },
});