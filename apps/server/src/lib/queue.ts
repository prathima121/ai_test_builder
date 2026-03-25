import { Queue } from "bullmq";
import IORedis from "ioredis";

let generationQueue: Queue | null = null;

export function initGenerationQueue() {
  if (process.env.QUEUE_ENABLED !== "true") {
    generationQueue = null;
    return;
  }

  try {
    const redisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true
    });

    redisConnection.on("error", () => {
      // Keep API alive when Redis is unavailable; generation can fallback.
    });

    generationQueue = new Queue("generation", {
      connection: redisConnection
    });
  } catch {
    generationQueue = null;
  }
}

export async function enqueueGenerationJob(name: string, data: Record<string, unknown>) {
  if (!generationQueue) {
    return false;
  }

  try {
    await generationQueue.add(name, data, { removeOnComplete: true, attempts: 3 });
    return true;
  } catch {
    return false;
  }
}
