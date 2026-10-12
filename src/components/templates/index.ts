/**
 * Engagement templates UI (SPEC.md section 20.2, W4 templates). Server-only
 * pieces (TemplatesSettingsSection) are imported from their own file.
 */
export { ConvertToPilotButton, ConvertToPilotDialog, isAssessmentProject } from "./convert-to-pilot";
export type { ConvertToPilotButtonProps, ConvertToPilotDialogProps } from "./convert-to-pilot";
export { NewProjectWithTemplate } from "./new-project-with-template";
export type { NewProjectWithTemplateProps } from "./new-project-with-template";
export { PhaseStrip } from "./phase-strip";
export type { PhaseStripProps } from "./phase-strip";
export { canProposeRetainer, ProposeRetainerButton, ProposeRetainerDialog } from "./propose-retainer";
export type { ProposeRetainerButtonProps, ProposeRetainerDialogProps } from "./propose-retainer";
export { SaveAsTemplateDialog } from "./save-as-template-dialog";
export type { SaveAsTemplateDialogProps } from "./save-as-template-dialog";
export { TemplatePicker } from "./template-picker";
export type { TemplatePickerProps } from "./template-picker";
export { TemplateSchedulePreview } from "./template-schedule-preview";
export type { TemplateSchedulePreviewProps } from "./template-schedule-preview";
export { TemplatesManager } from "./templates-manager";
export type { TemplatesManagerProps } from "./templates-manager";
