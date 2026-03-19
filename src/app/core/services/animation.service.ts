import { Injectable, inject, signal } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ApiService } from '@core/services/api.service';
import { AnimationConfig } from '@core/models/pipeline.models';
import { firstValueFrom } from 'rxjs';

export interface AnimationPreset {
  name: string;
  filename: string;
  format: string;
  url: string;
  frameCount: number;
  fps: number;
  loop: boolean;
}

interface AnimationFileInfo {
  name: string;
  filename: string;
  format: string;
  url: string;
}

// Default frame/fps guesses based on common animation names
const ANIM_DEFAULTS: Record<string, { frameCount: number; fps: number; loop: boolean }> = {
  idle: { frameCount: 30, fps: 24, loop: true },
  walk: { frameCount: 24, fps: 24, loop: true },
  walking: { frameCount: 24, fps: 24, loop: true },
  run: { frameCount: 20, fps: 24, loop: true },
  running: { frameCount: 20, fps: 24, loop: true },
  attack: { frameCount: 15, fps: 24, loop: false },
  jump: { frameCount: 20, fps: 24, loop: false },
  jumping: { frameCount: 20, fps: 24, loop: false },
  die: { frameCount: 25, fps: 24, loop: false },
  death: { frameCount: 25, fps: 24, loop: false },
  cast: { frameCount: 20, fps: 24, loop: false },
};

@Injectable({ providedIn: 'root' })
export class AnimationService {
  private readonly api = inject(ApiService);
  private readonly gltfLoader = new GLTFLoader();
  private readonly fbxLoader = new FBXLoader();
  private readonly clipCache = new Map<string, { clip: THREE.AnimationClip; scene: THREE.Object3D }>();

  readonly availablePresets = signal<AnimationPreset[]>([]);

  constructor() {
    this.loadAvailableAnimations();
  }

  private async loadAvailableAnimations(): Promise<void> {
    try {
      const files = await firstValueFrom(this.api.get<AnimationFileInfo[]>('/assets/animations'));
      const presets: AnimationPreset[] = files.map((f) => {
        const key = f.name.toLowerCase();
        const defaults = ANIM_DEFAULTS[key] ?? { frameCount: 24, fps: 24, loop: false };
        return {
          name: f.name,
          filename: f.filename,
          format: f.format,
          url: f.url,
          ...defaults,
        };
      });
      this.availablePresets.set(presets);
    } catch {
      // Backend not available or no animations
    }
  }

  async loadClip(preset: AnimationPreset): Promise<{ clip: THREE.AnimationClip; scene: THREE.Object3D } | null> {
    const cached = this.clipCache.get(preset.filename);
    if (cached) return { clip: cached.clip.clone(), scene: cached.scene };

    try {
      let clip: THREE.AnimationClip | undefined;
      let scene: THREE.Object3D;

      if (preset.format === 'fbx') {
        const fbx = await this.fbxLoader.loadAsync(preset.url);
        clip = fbx.animations[0];
        scene = fbx;
      } else {
        const gltf = await this.gltfLoader.loadAsync(preset.url);
        clip = gltf.animations[0];
        scene = gltf.scene;
      }

      if (clip) {
        clip.name = preset.name;
        this.clipCache.set(preset.filename, { clip, scene });
        return { clip: clip.clone(), scene };
      }
    } catch (err) {
      console.warn(`Failed to load animation "${preset.name}":`, err);
    }
    return null;
  }

  presetToConfig(preset: AnimationPreset): AnimationConfig {
    return {
      name: preset.name,
      clipUrl: preset.url,
      frameCount: preset.frameCount,
      fps: preset.fps,
      loop: preset.loop,
    };
  }
}
