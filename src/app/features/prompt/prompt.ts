import {
  Component,
  inject,
  signal,
  OnDestroy,
  ElementRef,
  viewChild,
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PipelineStateService } from '@core/services/pipeline-state.service';
import { ApiService } from '@core/services/api.service';
import { DecimalPipe } from '@angular/common';
import { Loading } from '@shared/components/loading/loading';
import { ModelResult, PipelineStep, PromptConfig } from '@core/models/pipeline.models';

interface TaskStatus {
  taskId: string;
  provider: 'tripo';
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
  progress: number;
  modelUrl?: string;
  hasRig?: boolean;
  polyCount?: number;
  textureCount?: number;
  error?: string;
}

@Component({
  selector: 'app-prompt',
  templateUrl: './prompt.html',
  styleUrl: './prompt.scss',
  imports: [FormsModule, DecimalPipe, Loading],
})
export class Prompt implements AfterViewInit, OnDestroy {
  private readonly state = inject(PipelineStateService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly previewCanvas = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  // Form state bound to pipeline
  config: PromptConfig = { ...this.state.promptConfig() };

  // UI state
  readonly isGenerating = signal(false);
  readonly progressPercent = signal(0);
  readonly progressMessage = signal('');
  readonly generationError = signal<string | null>(null);
  readonly showPreview = signal(false);
  readonly modelStats = signal<{ polyCount: number; hasRig: boolean; textureCount: number } | null>(null);

  // Reference image
  readonly referencePreview = signal<string | null>(null);
  private referenceFile: File | null = null;

  // Three.js
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private animationFrameId: number | null = null;

  // Polling
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngAfterViewInit(): void {
    // Preview canvas setup deferred until model loads
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.disposeThreeJs();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.referenceFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.referencePreview.set(reader.result as string);
      this.config.referenceImageUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeReferenceImage(): void {
    this.referenceFile = null;
    this.referencePreview.set(null);
    this.config.referenceImageUrl = null;
  }

  async generate(): Promise<void> {
    this.isGenerating.set(true);
    this.generationError.set(null);
    this.progressPercent.set(0);
    this.progressMessage.set('Submitting generation request...');
    this.showPreview.set(false);

    // Save config to pipeline state
    this.state.promptConfig.set({ ...this.config });

    try {
      const taskStatus = await firstValueFrom(this.api
        .post<TaskStatus>('/generate/model', {
          text: this.config.text,
          referenceImageUrl: this.config.referenceImageUrl,
          artStyle: this.config.artStyle,
          topology: this.config.topology,
          polyCount: this.config.polyCount,
          symmetry: this.config.symmetry,
        }));

      this.progressMessage.set('Generating 3D model...');
      this.startPolling(taskStatus.taskId);
    } catch (err: any) {
      this.isGenerating.set(false);
      this.generationError.set(err?.error?.error || err?.message || 'Generation failed');
    }
  }

  private startPolling(taskId: string): void {
    this.pollTimer = setInterval(async () => {
      try {
        const status = await firstValueFrom(this.api
          .get<TaskStatus>(`/generate/model/${taskId}/status`));

        this.progressPercent.set(status.progress);

        if (status.status === 'in_progress') {
          this.progressMessage.set(`Generating... ${status.progress}%`);
        } else if (status.status === 'succeeded') {
          this.stopPolling();
          this.progressMessage.set('Model ready!');
          await this.onModelReady(status);
        } else if (status.status === 'failed') {
          this.stopPolling();
          this.isGenerating.set(false);
          this.generationError.set(status.error || 'Generation failed');
        }
      } catch (err: any) {
        this.stopPolling();
        this.isGenerating.set(false);
        this.generationError.set('Failed to check generation status');
      }
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async onModelReady(status: TaskStatus): Promise<void> {
    this.isGenerating.set(false);

    const modelResult: ModelResult = {
      modelUrl: status.modelUrl!,
      format: 'glb',
      hasRig: status.hasRig ?? false,
      polyCount: status.polyCount ?? 0,
      textureCount: status.textureCount ?? 0,
      taskId: status.taskId,
      provider: status.provider,
    };

    this.state.modelResult.set(modelResult);
    this.modelStats.set({
      polyCount: modelResult.polyCount,
      hasRig: modelResult.hasRig,
      textureCount: modelResult.textureCount,
    });

    this.showPreview.set(true);

    // Wait for DOM to render the canvas
    requestAnimationFrame(() => {
      this.initThreeJs(modelResult.modelUrl);
    });
  }

  async approveModel(): Promise<void> {
    const model = this.state.modelResult();
    if (!model) return;

    // If model has no rig, attempt auto-rigging
    if (!model.hasRig) {
      this.isGenerating.set(true);
      this.progressMessage.set('Auto-rigging model...');
      this.progressPercent.set(0);

      try {
        const rigStatus = await firstValueFrom(this.api
          .post<TaskStatus>(`/generate/model/${model.taskId}/rig`, {}));

        if (rigStatus?.taskId) {
          // Poll for rigging completion
          this.startRigPolling(rigStatus.taskId);
          return;
        }
      } catch {
        // Rigging failed — proceed anyway, animations may still work
        this.isGenerating.set(false);
      }
    }

    this.state.goToStep(PipelineStep.Editor);
    this.router.navigate(['/editor']);
  }

  private startRigPolling(taskId: string): void {
    this.pollTimer = setInterval(async () => {
      try {
        const status = await firstValueFrom(this.api
          .get<TaskStatus>(`/generate/model/${taskId}/status`));

        this.progressPercent.set(status.progress);

        if (status.status === 'succeeded') {
          this.stopPolling();
          this.isGenerating.set(false);

          // Update model result with rigged version
          if (status.modelUrl) {
            const current = this.state.modelResult()!;
            this.state.modelResult.set({
              ...current,
              modelUrl: status.modelUrl,
              hasRig: true,
              taskId: status.taskId,
            });
            this.modelStats.update(s => s ? { ...s, hasRig: true } : s);
          }

          this.state.goToStep(PipelineStep.Editor);
          this.router.navigate(['/editor']);
        } else if (status.status === 'failed') {
          this.stopPolling();
          this.isGenerating.set(false);
          // Proceed without rig
          this.state.goToStep(PipelineStep.Editor);
          this.router.navigate(['/editor']);
        }
      } catch {
        this.stopPolling();
        this.isGenerating.set(false);
        this.state.goToStep(PipelineStep.Editor);
        this.router.navigate(['/editor']);
      }
    }, 3000);
  }

  regenerate(): void {
    this.showPreview.set(false);
    this.modelStats.set(null);
    this.state.modelResult.set(null);
    this.disposeThreeJs();
    this.generate();
  }

  // === Three.js Preview ===

  private initThreeJs(modelUrl: string): void {
    const canvasEl = this.previewCanvas()?.nativeElement;
    if (!canvasEl) return;

    this.disposeThreeJs();

    const width = canvasEl.clientWidth || 400;
    const height = canvasEl.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(3, 2, 3);

    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.controls = new OrbitControls(this.camera, canvasEl);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0.8, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 5);
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -3);
    this.scene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(6, 12, 0x444444, 0x333333);
    this.scene.add(grid);

    // Load model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Center model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;

        // Scale to fit
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 2) {
          const scale = 2 / maxDim;
          model.scale.setScalar(scale);
        }

        this.scene!.add(model);
        this.controls!.target.set(0, size.y / 2 * (2 / maxDim), 0);
        this.controls!.update();
      },
      undefined,
      (err) => console.error('Failed to load model:', err),
    );

    this.animate();
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    this.controls?.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private disposeThreeJs(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.controls?.dispose();
    this.renderer?.dispose();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }
}
