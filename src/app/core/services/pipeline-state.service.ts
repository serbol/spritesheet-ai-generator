import { Injectable, signal, computed } from '@angular/core';
import {
  PipelineStep,
  PromptConfig,
  ModelResult,
  AnimationConfig,
  CaptureConfig,
  CapturedFrame,
  StyleConfig,
  StyledFrame,
  StepStatus,
} from '@core/models/pipeline.models';

@Injectable({ providedIn: 'root' })
export class PipelineStateService {
  readonly currentStep = signal<PipelineStep>(PipelineStep.Prompt);

  readonly promptConfig = signal<PromptConfig>({
    text: '',
    referenceImageUrl: null,
    artStyle: 'stylized',
    topology: 'triangle',
    polyCount: 'medium',
    symmetry: true,
  });

  readonly modelResult = signal<ModelResult | null>(null);

  readonly selectedAnimations = signal<AnimationConfig[]>([]);

  readonly captureConfig = signal<CaptureConfig>({
    frameSize: 64,
    directions: 4,
    background: 'transparent',
    antiAlias: true,
    padding: 2,
    autoCrop: true,
    shadow: 'off',
    cameraPreset: {
      name: 'isometric',
      position: { x: 7, y: 7, z: 7 },
      rotation: { x: 0, y: 0, z: 0 },
      projection: 'orthographic',
    },
  });

  readonly capturedFrames = signal<CapturedFrame[]>([]);

  readonly styleConfig = signal<StyleConfig>({
    style: 'original',
    strength: 0.7,
    seed: Math.floor(Math.random() * 2147483647),
  });

  readonly styledFrames = signal<StyledFrame[]>([]);

  readonly spritesheetDataUrl = signal<string | null>(null);

  readonly isProcessing = signal<boolean>(false);
  readonly progressPercent = signal<number>(0);
  readonly progressMessage = signal<string>('');

  readonly stepStatuses = computed<Record<PipelineStep, StepStatus>>(() => {
    const step = this.currentStep();
    const model = this.modelResult();
    const anims = this.selectedAnimations();
    const frames = this.capturedFrames();
    const styled = this.styledFrames();

    return {
      [PipelineStep.Prompt]: step >= PipelineStep.Prompt ? (model ? 'completed' : 'active') : 'locked',
      [PipelineStep.Editor]: model ? (anims.length > 0 ? 'completed' : 'active') : 'locked',
      [PipelineStep.Capture]: anims.length > 0 ? (frames.length > 0 ? 'completed' : 'active') : 'locked',
      [PipelineStep.Stylize]: frames.length > 0 ? (styled.length > 0 ? 'completed' : 'active') : 'locked',
      [PipelineStep.Export]: styled.length > 0 ? 'active' : 'locked',
    };
  });

  canNavigateTo(step: PipelineStep): boolean {
    const statuses = this.stepStatuses();
    return statuses[step] !== 'locked';
  }

  goToStep(step: PipelineStep): void {
    if (this.canNavigateTo(step)) {
      this.currentStep.set(step);
    }
  }

  reset(): void {
    this.currentStep.set(PipelineStep.Prompt);
    this.modelResult.set(null);
    this.selectedAnimations.set([]);
    this.capturedFrames.set([]);
    this.styledFrames.set([]);
    this.spritesheetDataUrl.set(null);
    this.isProcessing.set(false);
    this.progressPercent.set(0);
    this.progressMessage.set('');
  }
}
