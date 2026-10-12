"use client";

import { forwardRef, useMemo } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import type { ProjectSummary } from "@/lib/types";

export interface ProjectSelectProps {
  id?: string;
  projects: ProjectSummary[];
  value: string;
  onChange: (projectId: string) => void;
  /** Text of the empty option ("" value); omit to require a project. */
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/** "CODE · Engagement name": the client code tells same-named engagements apart. */
export function projectOptionLabel(project: ProjectSummary): string {
  return project.client_code ? `${project.client_code} · ${project.name}` : project.name;
}

/**
 * Native project picker for the time forms (fast on phones, fully keyboard
 * accessible). Projects keep the order they arrive in (by name).
 */
export const ProjectSelect = forwardRef<HTMLSelectElement, ProjectSelectProps>(function ProjectSelect(
  { id, projects, value, onChange, placeholder, invalid, disabled, required, className, ...aria },
  ref,
) {
  const hasValue = useMemo(() => projects.some((project) => project.id === value), [projects, value]);
  return (
    <NativeSelect
      ref={ref}
      id={id}
      value={hasValue ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      invalid={invalid}
      disabled={disabled}
      required={required}
      wrapperClassName={className}
      aria-label={aria["aria-label"]}
      aria-describedby={aria["aria-describedby"]}
    >
      {placeholder !== undefined || !hasValue ? (
        <option value="" disabled={placeholder === undefined}>
          {placeholder ?? "Choose a project"}
        </option>
      ) : null}
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {projectOptionLabel(project)}
        </option>
      ))}
    </NativeSelect>
  );
});
