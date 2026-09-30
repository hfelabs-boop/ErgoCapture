"use client";

import type { TaskSettings } from "@/lib/ergo/settings";
import { useStore } from "@/lib/store";
import { Field, NumberInput, Select, Toggle } from "./ui";

/** Task inputs a camera cannot measure (load, coupling, exertion, shift length) plus workstation dimensions. */
export function SettingsPanel({ compact = false }: { compact?: boolean }) {
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const up = <K extends keyof TaskSettings>(k: K) => (v: TaskSettings[K]) => set({ [k]: v } as Partial<TaskSettings>);

  return (
    <div className="space-y-5">
      <Group title="Worker and load">
        <Field label="Worker height (cm)" hint="Scales the skeleton to real distances. 0 = estimate from video.">
          <NumberInput value={s.subjectHeightCm} onChange={up("subjectHeightCm")} min={0} max={230} />
        </Field>
        <Field label="Load handled (kg)" hint="Cameras cannot weigh objects: enter it.">
          <NumberInput value={s.loadKg} onChange={up("loadKg")} min={0} step={0.5} />
        </Field>
        <Field label="Load applies">
          <Select
            value={s.loadApplies}
            onChange={up("loadApplies")}
            options={[
              { value: "auto", label: "When hands appear to hold something" },
              { value: "always", label: "Whole recording" },
              { value: "never", label: "Never" },
            ]}
          />
        </Field>
        <Field label="Force pattern (RULA)">
          <Select
            value={s.loadPattern}
            onChange={up("loadPattern")}
            options={[
              { value: "intermittent", label: "Intermittent" },
              { value: "static", label: "Static (held > 1 min)" },
              { value: "repeated", label: "Repeated (> 4/min)" },
            ]}
          />
        </Field>
        <Field label="Hand coupling (REBA / NIOSH)">
          <Select
            value={s.coupling}
            onChange={up("coupling")}
            options={[
              { value: "good", label: "Good (handles, power grip)" },
              { value: "fair", label: "Fair" },
              { value: "poor", label: "Poor" },
              { value: "unacceptable", label: "Unacceptable" },
            ]}
          />
        </Field>
        <Field label="Hours per day on this task">
          <NumberInput value={s.taskHoursPerDay} onChange={up("taskHoursPerDay")} min={0.25} max={12} step={0.25} />
        </Field>
      </Group>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle checked={s.shockForce} onChange={up("shockForce")} label="Shock or rapid build-up of force" />
        <Toggle checked={s.armsSupported} onChange={up("armsSupported")} label="Arms supported / worker leaning" />
        <Toggle checked={s.trunkSupported} onChange={up("trunkSupported")} label="Trunk well supported (seated)" />
        <Field label="Seated">
          <Select
            value={s.seated}
            onChange={up("seated")}
            options={[
              { value: "auto", label: "Detect automatically" },
              { value: "yes", label: "Seated" },
              { value: "no", label: "Standing" },
            ]}
          />
        </Field>
      </div>
      {!compact && (
        <>
          <Group title="NIOSH lifting">
            <Field label="Lifts per minute" hint="0 = count detected lifts">
              <NumberInput value={s.nioshLiftsPerMin} onChange={up("nioshLiftsPerMin")} min={0} max={20} step={0.1} />
            </Field>
            <Toggle checked={s.nioshDestinationControl} onChange={up("nioshDestinationControl")} label="Significant control at destination" />
          </Group>
          <Group title="Repetitive work (Strain Index, OCRA)">
            <Field label="Intensity of exertion" hint="Strain Index rating">
              <Select
                value={s.siIntensity}
                onChange={up("siIntensity")}
                options={[
                  { value: 1, label: "1 Light (barely noticeable)" },
                  { value: 2, label: "2 Somewhat hard" },
                  { value: 3, label: "3 Hard (noticeable effort)" },
                  { value: 4, label: "4 Very hard" },
                  { value: 5, label: "5 Near maximal" },
                ]}
              />
            </Field>
            <Field label="Speed of work">
              <Select
                value={s.siSpeed}
                onChange={up("siSpeed")}
                options={[
                  { value: 1, label: "1 Very slow" },
                  { value: 2, label: "2 Slow" },
                  { value: 3, label: "3 Fair" },
                  { value: 4, label: "4 Fast" },
                  { value: 5, label: "5 Very fast" },
                ]}
              />
            </Field>
            <Field label="OCRA recovery" hint="0 = hourly breaks … 10 = none">
              <NumberInput value={s.ocraRecovery} onChange={up("ocraRecovery")} min={0} max={10} />
            </Field>
            <Field label="OCRA force" hint="Borg-based checklist points">
              <NumberInput value={s.ocraForce} onChange={up("ocraForce")} min={0} max={32} />
            </Field>
            <Field label="OCRA grip">
              <Select
                value={s.ocraGrip}
                onChange={up("ocraGrip")}
                options={[
                  { value: 0, label: "0 Normal grip" },
                  { value: 2, label: "2 Pinch/hook ≈ 1/3 of time" },
                  { value: 4, label: "4 ≈ 2/3 of time" },
                  { value: 8, label: "8 Almost always" },
                ]}
              />
            </Field>
            <Field label="OCRA additional factors" hint="Gloves, vibration, precision …">
              <NumberInput value={s.ocraAdditional} onChange={up("ocraAdditional")} min={0} max={3} />
            </Field>
            <Field label="Technical actions per cycle" hint="0 = estimate from hand movements">
              <NumberInput value={s.ocraActionsPerCycle} onChange={up("ocraActionsPerCycle")} min={0} max={100} />
            </Field>
          </Group>
          <Group title="Workstation (anthropometric fit)">
            <Field label="Work surface height (cm)" hint="0 = not assessed">
              <NumberInput value={s.workSurfaceCm} onChange={up("workSurfaceCm")} min={0} max={200} />
            </Field>
            <Field label="Work type">
              <Select
                value={s.workType}
                onChange={up("workType")}
                options={[
                  { value: "precision", label: "Precision" },
                  { value: "light", label: "Light assembly" },
                  { value: "heavy", label: "Heavy / forceful" },
                ]}
              />
            </Field>
            <Field label="Farthest control or part (cm)" hint="Horizontal distance from the body front. 0 = not assessed">
              <NumberInput value={s.farthestControlCm} onChange={up("farthestControlCm")} min={0} max={200} />
            </Field>
          </Group>
        </>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}
