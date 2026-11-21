"use client";

import { useState, useTransition } from "react";
import { saveProfileAction } from "@/app/(app)/cv/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CvProfile } from "@/server/cv/schemas";

type Skill = CvProfile["skills"][number];
type Level = Skill["level"];

export function ProfileEditor({ cvId, initial }: { cvId: string; initial: CvProfile }) {
  const [profile, setProfile] = useState<CvProfile>(initial);
  // Raw textarea text, so a trailing newline survives typing; split and filtered on save.
  const [highlightText, setHighlightText] = useState<string[]>(() =>
    initial.experience.map((e) => e.highlights.join("\n")),
  );
  const [newSkill, setNewSkill] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const patch = (p: Partial<CvProfile>) => {
    setStatus(null);
    setProfile((prev) => ({ ...prev, ...p }));
  };
  const setSkill = (i: number, s: Skill) =>
    patch({ skills: profile.skills.map((x, j) => (j === i ? s : x)) });
  const setExperience = (i: number, e: Partial<CvProfile["experience"][number]>) =>
    patch({ experience: profile.experience.map((x, j) => (j === i ? { ...x, ...e } : x)) });

  function addSkill() {
    const name = newSkill.trim();
    if (!name || profile.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    patch({ skills: [...profile.skills, { name, category: "technical", level: 3 }] });
    setNewSkill("");
  }

  function save() {
    setStatus(null);
    start(async () => {
      const toSave: CvProfile = {
        ...profile,
        experience: profile.experience.map((e, i) => ({
          ...e,
          highlights: (highlightText[i] ?? "").split("\n").filter((l) => l.trim() !== ""),
        })),
      };
      const result = await saveProfileAction(cvId, toSave);
      setStatus(
        result.ok ? { kind: "ok", text: "Profile saved." } : { kind: "error", text: result.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            value={profile.headline}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label>Skills</Label>
          <ul className="flex flex-wrap gap-2">
            {profile.skills.map((skill, i) => (
              <li key={`${skill.name}-${i}`}>
                <Badge variant="secondary" className="h-auto gap-2 py-1">
                  <span>{skill.name}</span>
                  <select
                    aria-label={`${skill.name} level`}
                    value={skill.level}
                    onChange={(e) =>
                      setSkill(i, { ...skill, level: Number(e.target.value) as Level })
                    }
                    className="bg-transparent text-xs"
                  >
                    {[1, 2, 3, 4, 5].map((l) => (
                      <option key={l} value={l}>
                        {l}/5
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove ${skill.name}`}
                    onClick={() => patch({ skills: profile.skills.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              aria-label="Add a skill"
              placeholder="Add a skill"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addSkill}>
              Add
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <Label>Experience</Label>
          {profile.experience.map((exp, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  aria-label="Job title"
                  value={exp.title}
                  onChange={(e) => setExperience(i, { title: e.target.value })}
                />
                <Input
                  aria-label="Company"
                  value={exp.company}
                  onChange={(e) => setExperience(i, { company: e.target.value })}
                />
                <Input
                  aria-label="Start"
                  value={exp.start}
                  onChange={(e) => setExperience(i, { start: e.target.value })}
                />
                <Input
                  aria-label="End (empty if current)"
                  placeholder="Present"
                  value={exp.end ?? ""}
                  onChange={(e) => setExperience(i, { end: e.target.value || null })}
                />
              </div>
              <Textarea
                aria-label="Highlights, one per line"
                rows={3}
                value={highlightText[i] ?? ""}
                onChange={(e) => {
                  setStatus(null);
                  setHighlightText((prev) => prev.map((t, j) => (j === i ? e.target.value : t)));
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {status && (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className={status.kind === "error" ? "text-sm text-destructive" : "text-sm"}
            >
              {status.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
