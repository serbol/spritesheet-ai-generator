import {
  Component,
  inject,
  signal,
  computed,
  OnDestroy,
  ElementRef,
  viewChild,
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PipelineStateService } from '@core/services/pipeline-state.service';
import { AnimationService, AnimationPreset } from '@core/services/animation.service';
import { AnimationConfig, PipelineStep } from '@core/models/pipeline.models';
import { getBoneNames, buildBoneMapping, remapClipTrackNames } from '@core/utils/animation-retarget';

interface AnimationEntry {
  preset: AnimationPreset;
  clip: THREE.AnimationClip | null;
  action: THREE.AnimationAction | null;
  selected: boolean;
  loading: boolean;
  error: string | null;
  frameCount: number;
  fps: number;
  speed: number;
  loop: boolean;
  trimStart: number;
  trimEnd: number;
}

@Component({
  selector: 'app-editor',
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  imports: [FormsModule],
})
export class Editor implements AfterViewInit, OnDestroy {
  private readonly state = inject(PipelineStateService);
  private readonly animService = inject(AnimationService);
  private readonly router = inject(Router);

  readonly viewport = viewChild<ElementRef<HTMLCanvasElement>>('viewport');

  // Three.js objects
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();
  private mixer: THREE.AnimationMixer | null = null;
  private loadedModel: THREE.Object3D | null = null;
  private skeletonHelper: THREE.SkeletonHelper | null = null;

  // UI state
  readonly modelUrl = computed(() => this.state.modelResult()?.modelUrl ?? null);
  readonly modelLoaded = signal(false);
  readonly showSkeleton = signal(true);
  readonly animations = signal<AnimationEntry[]>([]);
  readonly activeAnimation = signal<AnimationEntry | null>(null);
  readonly isPlaying = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly availablePresets = this.animService.availablePresets;
  readonly hasSelectedAnimations = computed(() => this.animations().some((a) => a.selected));
  readonly boneCount = signal(0);

  ngAfterViewInit(): void {
    const url = this.modelUrl();
    if (url) {
      requestAnimationFrame(() => this.initScene(url));
    }
  }

  ngOnDestroy(): void {
    this.disposeScene();
  }

  // === Scene Setup ===

  private initScene(modelUrl: string): void {
    const canvasEl = this.viewport()?.nativeElement;
    if (!canvasEl) return;

    this.disposeScene();

    const width = canvasEl.clientWidth || 600;
    const height = canvasEl.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(3, 2.5, 3);

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
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 5);
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -3);
    this.scene.add(fillLight);

    // Grid
    this.scene.add(new THREE.GridHelper(6, 12, 0x444444, 0x333333));

    // Load model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        this.loadedModel = model;

        // Center and scale
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 2) {
          model.scale.setScalar(2 / maxDim);
        }

        this.scene!.add(model);
        this.mixer = new THREE.AnimationMixer(model);

        // Skeleton helper
        this.skeletonHelper = new THREE.SkeletonHelper(model);
        (this.skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2;
        this.scene!.add(this.skeletonHelper);

        // Count bones
        const bones = getBoneNames(model);
        this.boneCount.set(bones.length);

        // If model came with animations, add them
        if (gltf.animations.length > 0) {
          for (const clip of gltf.animations) {
            const entry: AnimationEntry = {
              preset: {
                name: clip.name || 'Embedded',
                filename: '',
                format: 'glb',
                url: '',
                frameCount: Math.round(clip.duration * 24),
                fps: 24,
                loop: true,
              },
              clip,
              action: this.mixer!.clipAction(clip),
              selected: false,
              loading: false,
              error: null,
              frameCount: Math.round(clip.duration * 24),
              fps: 24,
              speed: 1,
              loop: true,
              trimStart: 0,
              trimEnd: clip.duration,
            };
            this.animations.update((list) => [...list, entry]);
          }
        }

        this.controls!.target.set(0, (size.y / 2) * (2 / maxDim), 0);
        this.controls!.update();
        this.modelLoaded.set(true);
      },
      undefined,
      (err) => console.error('Failed to load model:', err),
    );

    this.animate();
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();

    if (this.mixer && this.isPlaying()) {
      this.mixer.update(delta);

      // Update timeline position
      const active = this.activeAnimation();
      if (active?.action) {
        this.currentTime.set(active.action.time);
      }
    }

    this.controls?.update();
    if (this.skeletonHelper) {
      this.skeletonHelper.visible = this.showSkeleton();
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private disposeScene(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.loadedModel = null;
    this.skeletonHelper = null;
    this.controls?.dispose();
    this.renderer?.dispose();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }

  // === Animation Management ===

  async loadAnimation(preset: AnimationPreset): Promise<void> {
    if (!this.mixer || !this.loadedModel) return;

    // Check if already loaded
    if (this.animations().find((a) => a.preset.filename === preset.filename)) return;

    const entry: AnimationEntry = {
      preset,
      clip: null,
      action: null,
      selected: false,
      loading: true,
      error: null,
      frameCount: preset.frameCount,
      fps: preset.fps,
      speed: 1,
      loop: preset.loop,
      trimStart: 0,
      trimEnd: 0,
    };
    this.animations.update((list) => [...list, entry]);

    try {
      const result = await this.animService.loadClip(preset);

      if (!result) {
        this.updateEntry(preset.filename, { loading: false, error: 'No animation data found' });
        return;
      }

      // Remap animation track names to match model's skeleton
      let clip: THREE.AnimationClip;
      const sourceBones = getBoneNames(result.scene);
      const targetBones = getBoneNames(this.loadedModel);

      console.log('[Animation] Source bones:', sourceBones);
      console.log('[Animation] Target bones:', targetBones);
      console.log('[Animation] Track names:', result.clip.tracks.map(t => t.name));

      if (sourceBones.length > 0 && targetBones.length > 0) {
        const mapping = buildBoneMapping(sourceBones, targetBones);
        console.log('[Animation] Bone mapping:', mapping);
        if (Object.keys(mapping).length > 0) {
          clip = remapClipTrackNames(result.clip, mapping);
          console.log('[Animation] Remapped tracks:', clip.tracks.map(t => t.name));
        } else {
          console.warn('[Animation] No bone mapping found, applying clip directly');
          clip = result.clip;
        }
      } else {
        clip = result.clip;
      }

      clip.name = preset.name;
      const action = this.mixer!.clipAction(clip);
      action.setLoop(preset.loop ? THREE.LoopRepeat : THREE.LoopOnce, preset.loop ? Infinity : 1);
      if (!preset.loop) action.clampWhenFinished = true;

      this.updateEntry(preset.filename, {
        clip,
        action,
        loading: false,
        trimEnd: clip.duration,
      });
    } catch (err: any) {
      this.updateEntry(preset.filename, {
        loading: false,
        error: err.message || 'Failed to load animation',
      });
    }
  }

  private updateEntry(filename: string, updates: Partial<AnimationEntry>): void {
    this.animations.update((list) =>
      list.map((a) =>
        a.preset.filename === filename ? { ...a, ...updates } : a,
      ),
    );
  }

  toggleAnimation(entry: AnimationEntry): void {
    this.animations.update((list) =>
      list.map((a) =>
        a === entry ? { ...a, selected: !a.selected } : a,
      ),
    );
  }

  playAnimation(entry: AnimationEntry): void {
    if (!this.mixer || !entry.action) return;

    // Stop all other actions
    this.mixer.stopAllAction();

    const action = entry.action;
    action.reset();
    action.setEffectiveTimeScale(entry.speed);
    action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, entry.loop ? Infinity : 1);
    if (!entry.loop) action.clampWhenFinished = true;
    action.play();

    this.activeAnimation.set(entry);
    this.duration.set(entry.clip!.duration);
    this.currentTime.set(0);
    this.isPlaying.set(true);
    this.clock.getDelta(); // Reset delta
  }

  togglePlayPause(): void {
    const active = this.activeAnimation();
    if (!active?.action) return;

    if (this.isPlaying()) {
      active.action.paused = true;
      this.isPlaying.set(false);
    } else {
      active.action.paused = false;
      this.isPlaying.set(true);
    }
  }

  stopAnimation(): void {
    this.mixer?.stopAllAction();
    this.isPlaying.set(false);
    this.activeAnimation.set(null);
    this.currentTime.set(0);
  }

  scrubTo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const time = parseFloat(input.value);
    const active = this.activeAnimation();
    if (!active?.action) return;

    active.action.time = time;
    this.currentTime.set(time);

    if (!this.isPlaying()) {
      // Update one frame to show the scrubbed position
      this.mixer?.update(0);
    }
  }

  updateSpeed(entry: AnimationEntry, speed: number): void {
    this.animations.update((list) =>
      list.map((a) => (a === entry ? { ...a, speed } : a)),
    );
    if (this.activeAnimation() === entry && entry.action) {
      entry.action.setEffectiveTimeScale(speed);
    }
  }

  updateFrameCount(entry: AnimationEntry, frameCount: number): void {
    this.animations.update((list) =>
      list.map((a) => (a === entry ? { ...a, frameCount } : a)),
    );
  }

  updateFps(entry: AnimationEntry, fps: number): void {
    this.animations.update((list) =>
      list.map((a) => (a === entry ? { ...a, fps } : a)),
    );
  }

  toggleLoop(entry: AnimationEntry): void {
    const newLoop = !entry.loop;
    this.animations.update((list) =>
      list.map((a) => (a === entry ? { ...a, loop: newLoop } : a)),
    );
    if (entry.action) {
      entry.action.setLoop(newLoop ? THREE.LoopRepeat : THREE.LoopOnce, newLoop ? Infinity : 1);
      if (!newLoop) entry.action.clampWhenFinished = true;
    }
  }

  toggleSkeleton(): void {
    this.showSkeleton.update((v) => !v);
  }

  // === Navigation ===

  confirmAndContinue(): void {
    const selected = this.animations().filter((a) => a.selected && a.clip);
    if (selected.length === 0) return;

    const configs: AnimationConfig[] = selected.map((a) => ({
      name: a.preset.name,
      clipUrl: a.preset.filename ? `/api/static/animations/${a.preset.filename}` : '',
      frameCount: a.frameCount,
      fps: a.fps,
      loop: a.loop,
    }));

    this.state.selectedAnimations.set(configs);
    this.state.goToStep(PipelineStep.Capture);
    this.router.navigate(['/capture']);
  }

  goBack(): void {
    this.router.navigate(['/prompt']);
  }
}
