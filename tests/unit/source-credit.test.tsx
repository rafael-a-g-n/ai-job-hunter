import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sourceLabel, sourceSite } from "@/components/jobs/posted-ago";
import { SourceCredit } from "@/components/jobs/source-credit";

describe("source credit", () => {
  it.each([
    ["HIMALAYAS", "Himalayas", "https://himalayas.app"],
    ["JOBICY", "Jobicy", "https://jobicy.com"],
    ["REMOTIVE", "Remotive", "https://remotive.com"],
  ])("credits %s with a link to its site", (source, label, site) => {
    expect(sourceLabel(source)).toBe(label);
    expect(sourceSite(source)).toBe(site);
    const html = renderToStaticMarkup(<SourceCredit source={source} />);
    expect(html).toContain(`href="${site}"`);
    expect(html).toContain(label);
  });

  it("renders nothing for a job pasted by the user", () => {
    expect(renderToStaticMarkup(<SourceCredit source="MANUAL" />)).toBe("");
  });
});
