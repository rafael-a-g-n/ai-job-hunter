import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const JOB_SOURCES = ["HIMALAYAS", "REMOTIVE", "ARBEITNOW", "ADZUNA", "MANUAL"] as const;

/** Plain GET form: filters live in the URL and need no client JS. Submitting resets to page 1. */
export function JobFilters({
  q,
  location,
  remote,
  source,
}: {
  q: string;
  location: string;
  remote: boolean;
  source: string;
}) {
  return (
    <form action="/jobs" method="get" className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="job-q">Search</Label>
        <Input id="job-q" name="q" defaultValue={q} placeholder="React, designer, Acme" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="job-location">Location</Label>
        <Input id="job-location" name="location" defaultValue={location} placeholder="Lisbon" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="job-source">Source</Label>
        <select
          id="job-source"
          name="source"
          defaultValue={source}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="">All sources</option>
          <option value="HIMALAYAS">Himalayas</option>
          <option value="REMOTIVE">Remotive</option>
          <option value="ARBEITNOW">Arbeitnow</option>
          <option value="ADZUNA">Adzuna</option>
          <option value="MANUAL">Pasted by you</option>
        </select>
      </div>
      <label className="flex h-8 items-center gap-2 text-sm">
        <input type="checkbox" name="remote" value="1" defaultChecked={remote} />
        Remote only
      </label>
      <Button type="submit">Search</Button>
    </form>
  );
}
