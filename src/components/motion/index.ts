/**
 * Motion helpers (SPEC.md section 20.1). Import from "@/components/motion".
 * Everything here follows the app's motion setting (data-motion on <html>).
 */
export { AuroraBackground } from "./aurora-background";
export { MotionProvider } from "./motion-provider";
export { ParticlesCanvas, type ParticlesCanvasProps } from "./particles-canvas";
export { FadeIn, Reveal, type FadeInProps, type RevealProps } from "./reveal";
export { Stagger, StaggerItem, type StaggerItemProps, type StaggerProps } from "./stagger";
export { TextShine, type TextShineProps } from "./text-shine";
export {
  useMotionPreference,
  useReducedMotionPreference,
  useTransparencyPreference,
} from "./use-motion-preference";
