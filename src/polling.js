/**
 * Poll a generation until it reaches a terminal state
 */

class PollingTimeoutError extends Error {
  constructor(generationId, timeoutMs) {
    const seconds = Math.round(timeoutMs / 1000);
    super(
      `Generation timed out after ${seconds}s of polling. The generation may STILL be running on the server — ` +
      `call get_generation_status with generation_id="${generationId}" to check its current state. ` +
      `Videos, deep-think chat, and large batches can take longer than the default polling window.`
    );
    this.name = 'PollingTimeoutError';
    this.generationId = generationId;
    this.timeoutMs = timeoutMs;
    this.timedOut = true;
  }
}

class GenerationFailedError extends Error {
  constructor(generationId, reason) {
    super(`Generation failed: ${reason || 'unknown error'} (generation_id="${generationId}")`);
    this.name = 'GenerationFailedError';
    this.generationId = generationId;
  }
}

async function pollUntilDone(client, generationId, options = {}) {
  const {
    interval = 5000,
    timeout = 300000, // 5 minutes default
    statusUrl
  } = options;

  const startTime = Date.now();
  const url = statusUrl || `/v1/generate/${generationId}/status`;

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new PollingTimeoutError(generationId, timeout);
    }

    const result = await client.get(url);

    if (result.state === 'completed') {
      return result;
    }

    if (result.state === 'failed') {
      throw new GenerationFailedError(generationId, result.error);
    }

    if (result.state === 'cancelled') {
      throw new GenerationFailedError(generationId, 'generation was cancelled');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

module.exports = { pollUntilDone, PollingTimeoutError, GenerationFailedError };
