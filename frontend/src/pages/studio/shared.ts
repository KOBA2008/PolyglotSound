import type { Project, StepName } from "../../types";

export interface StepProps {
  project: Project;
  setProject: (p: Project) => void;
  run: (step: StepName, body?: Record<string, unknown>) => Promise<void>;
  busy: StepName | null;
  errors: Partial<Record<StepName | "save", string>>;
  setError: (k: StepName | "save", msg: string | null) => void;
  fileUrl: (path: string | null | undefined) => string | null;
  goTo: (i: number) => void;
}

export const fmtSec = (t: number) => `${t.toFixed(2)} s`;
