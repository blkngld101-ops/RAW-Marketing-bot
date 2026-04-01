import { generatePosts } from "./lib/generation.js";

const result = await generatePosts();

if (result.skipped) {
  console.log(result.reason);
} else {
  console.log(
    `Generated ${result.created} post(s). Queue size: ${result.queue.posts.length}.`
  );
}
