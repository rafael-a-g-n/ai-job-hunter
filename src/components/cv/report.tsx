import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CvAnalysis } from "@/server/cv/schemas";
import { ScoreRing } from "./score-ring";

const SECTION_LABELS: Record<keyof CvAnalysis["sections"], string> = {
  clarity: "Clarity",
  impact: "Impact",
  atsCompatibility: "ATS compatibility",
  skills: "Skills",
};

export function CvReport({ analysis }: { analysis: CvAnalysis }) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-8">
          <ScoreRing score={analysis.overallScore} />
          <div className="grid min-w-64 flex-1 gap-4">
            {(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).map((key) => {
              const section = analysis.sections[key];
              return (
                <div key={key} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{SECTION_LABELS[key]}</span>
                    <span>{Math.round(section.score)}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={SECTION_LABELS[key]}
                    aria-valuenow={Math.round(section.score)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full bg-primary" style={{ width: `${section.score}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">{section.comment}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Strengths</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {analysis.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Improvements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {analysis.improvements.map((imp, i) => (
            <div key={i} className="grid gap-1 text-sm">
              <p className="font-medium">{imp.title}</p>
              <p className="text-muted-foreground">{imp.detail}</p>
              {imp.example && (
                <p className="rounded-md bg-muted p-2 italic">Example: {imp.example}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
