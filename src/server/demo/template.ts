import { DemoTemplate } from "./template-schema";
import data from "./template-data.json";

export { DemoTemplate } from "./template-schema";

let cached: DemoTemplate | undefined;

/** The validated template shipped in template-data.json. Throws if the file is malformed. */
export function loadDemoTemplate(): DemoTemplate {
  cached ??= DemoTemplate.parse(data);
  return cached;
}
