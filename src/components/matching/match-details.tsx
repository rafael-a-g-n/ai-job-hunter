import type { MatchView } from "@/server/matching/match";
import { SkillChips } from "./skill-chips";

export function MatchDetails({ match }: { match: MatchView }) {
  return (
    <div className="grid gap-3">
      <SkillChips label="Matched skills" items={match.matchedSkills} tone="match" />
      <SkillChips label="Gaps" items={match.gaps} tone="gap" />
      {match.explanation && <p className="text-sm">{match.explanation}</p>}
    </div>
  );
}
