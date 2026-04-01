import { DATA_PATHS, readJsonFile } from "./lib/raw-core.js";
import { renderQueue } from "./lib/rendering.js";

const queue = await readJsonFile(DATA_PATHS.queue, {
  generated_at: null,
  posts: []
});

const result = await renderQueue(queue);
console.log(`Rendered ${result.rendered} post(s).`);
