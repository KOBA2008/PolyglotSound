// Types du contrat docs/CONTRACT.md

export type SourceLang = "fon" | "yor" | "fra" | "eng";
export type TargetLang = "eng" | "fra" | "fon";
export type Mode = "demo" | "live";
export type StepStatus = "pending" | "running" | "done" | "error";
export type StepName = "separate" | "transcribe" | "align" | "translate" | "sing" | "finalize";

export interface StepState {
  status: StepStatus;
  message: string;
  progress: number;
}

export interface Syllable {
  text: string;
  start: number;
  end: number;
  stress: boolean;
}

export interface Variant {
  text: string;
  syllables: number;
  split: string[];
  ok: boolean;
}

export interface Line {
  index: number;
  text: string;
  meaning: string;
  start: number;
  end: number;
  syllables: Syllable[];
  n_syllables: number;
  stress_positions: number[];
  variants: Variant[];
  chosen: string | null;
}

export interface ProjectFiles {
  original: string | null;
  vocals: string | null;
  instrumental: string | null;
  guide: string | null;
  sung: string | null;
  final: string | null;
  [k: string]: string | null;
}

export interface Pitch {
  hop: number;
  f0: number[];
}

export interface Project {
  id: string;
  title: string;
  artist: string;
  source_lang: SourceLang;
  target_lang: TargetLang;
  consent: boolean;
  created_at: string;
  mode: Mode;
  duration: number | null;
  files: ProjectFiles;
  lines: Line[];
  pitch?: Pitch | null;
  steps: Record<StepName, StepState>;
  watermark: { applied: boolean; message: string | null };
}

export interface Health {
  status: string;
  mode: Mode;
  worker: boolean;
  llm: { provider: string; model: string | null };
}

export interface AdaptRequest {
  text?: string;
  meaning: string;
  target_lang: TargetLang;
  n_syllables: number;
  stress_positions?: number[];
  n_variants?: number;
}

export interface SyllablesResult {
  count: number;
  split: string[];
}

export interface WatermarkResult {
  detected: boolean;
  confidence: number;
  message: string | null;
  mode: Mode;
}

export const STEP_ORDER: StepName[] = ["separate", "transcribe", "align", "translate", "sing", "finalize"];

export const SOURCE_LANGS: { code: SourceLang; label: string }[] = [
  { code: "fon", label: "Fon" },
  { code: "yor", label: "Yorùbá" },
  { code: "fra", label: "Français" },
  { code: "eng", label: "Anglais" },
];

export const TARGET_LANGS: { code: TargetLang; label: string }[] = [
  { code: "eng", label: "Anglais" },
  { code: "fra", label: "Français" },
  { code: "fon", label: "Fon" },
];

export function langLabel(code: string): string {
  return [...SOURCE_LANGS, ...TARGET_LANGS].find((l) => l.code === code)?.label ?? code;
}
