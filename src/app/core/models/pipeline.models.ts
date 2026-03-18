export enum PipelineStep {
  Prompt = 0,
  Editor = 1,
  Capture = 2,
  Stylize = 3,
  Export = 4,
}

export interface PromptConfig {
  text: string;
  referenceImageUrl: string | null;
  artStyle: 'realistic' | 'stylized' | 'low-poly';
  topology: 'quad' | 'triangle';
  polyCount: 'low' | 'medium' | 'high';
  symmetry: boolean;
}

export interface ModelResult {
  modelUrl: string;
  format: 'glb' | 'fbx';
  hasRig: boolean;
  polyCount: number;
  textureCount: number;
  taskId: string;
  provider: 'meshy' | 'tripo';
}

export interface AnimationConfig {
  name: string;
  clipUrl: string;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export interface CameraPreset {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  projection: 'perspective' | 'orthographic';
  fov?: number;
}

export interface CaptureConfig {
  frameSize: number;
  directions: 4 | 8;
  background: 'transparent' | string;
  antiAlias: boolean;
  padding: number;
  autoCrop: boolean;
  shadow: 'on' | 'off' | 'baked';
  cameraPreset: CameraPreset;
}

export interface CapturedFrame {
  animationName: string;
  direction: number;
  frameIndex: number;
  dataUrl: string;
}

export interface StyleConfig {
  style: 'original' | 'pixel-art' | 'cartoonish' | 'simplified' | 'outlined' | 'hand-drawn' | 'retro-16bit';
  strength: number;
  seed: number;
}

export interface StyledFrame extends CapturedFrame {
  styledDataUrl: string;
}

export interface SpritesheetMetadata {
  spritesheet: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, {
    row: number;
    frames: number;
    fps: number;
    loop: boolean;
  }>;
}

export type StepStatus = 'locked' | 'active' | 'completed';
