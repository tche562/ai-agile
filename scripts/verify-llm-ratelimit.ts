import "dotenv/config";
import { enforceLLMRateLimit, isLLMRateLimitEnabled } from "../src/server/llm/ratelimit";
import { LLMRateLimitError } from "../src/server/llm/types";

async function main() {
  if (!isLLMRateLimitEnabled()) {
    throw new Error(
      "LLM rate limiting is disabled. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env, or set LLM_RATELIMIT_ENABLED=true.",
    );
  }

  const attempts = Number(process.argv[2] ?? "8");

  console.log(`Running ${attempts} rate-limit checks without calling any LLM...`);

  for (let i = 1; i <= attempts; i += 1) {
    try {
      const result = await enforceLLMRateLimit({
        userId: "verify-user",
        projectId: "verify-ratelimit-project",
        provider: "openai",
      });

      console.log(`Attempt ${i}: allowed. remaining=${result?.remaining} reset=${result?.reset}`);
    } catch (error) {
      if (error instanceof LLMRateLimitError) {
        console.log(
          `Attempt ${i}: blocked with ${error.statusCode}. retryAfter=${error.retryAfterSeconds}s`,
        );
        process.exit(0);
      }

      throw error;
    }
  }

  throw new Error(
    "Rate limit was not triggered. Lower LLM_RATELIMIT_REQUESTS or increase the attempt count.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
