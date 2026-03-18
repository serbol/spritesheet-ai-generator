# Spritesheet AI Generator — Implementation Plan

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Angular 21 Frontend                       │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌─────┐ │
│  │ Prompt   │→ │ 3D Editor│→ │ Capture  │→ │Stylize │→ │Export│ │
│  │ (Step 1) │  │ (Step 2) │  │ (Step 3) │  │(Step 4)│  │  (5) │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  └─────┘ │
│       │              │             │             │          │    │
└───────┼──────────────┼─────────────┼─────────────┼──────────┼───┘
        │              │             │             │          │
┌───────┼──────────────┼─────────────┼─────────────┼──────────┼───┐
│       ▼              ▼             ▼             ▼          ▼   │
│              Express Backend (API Proxy + Storage)              │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Meshy/Tripo │  │ Asset Store  │  │ Stability/Replicate   │  │
│  │ API Proxy   │  │ (files/S3)   │  │ API Proxy             │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Project Scaffolding

### 0.1 — Initialize Angular 21 Project
- `ng new spritesheet-ai-generator --style=scss --ssr=false --routing`
- Configure standalone components (default in Angular 21)
- Set up path aliases in `tsconfig.json` (`@core/`, `@features/`, `@shared/`)

### 0.2 — Set Up Express Backend
- Create `server/` directory with Express + TypeScript
- Configure `dotenv` for API key management
- Set up CORS for local development
- Add proxy config in `angular.json` to forward `/api/*` to Express

### 0.3 — Install Core Dependencies
```
# Frontend
npm install three @types/three theatre @theatre/core @theatre/studio
npm install @angular/cdk

# Backend
npm install express cors dotenv multer axios form-data
npm install -D @types/express @types/cors @types/multer
```

### 0.4 — Create Feature Module Structure
- Create lazy-loaded routes for each step
- Implement a `StepperComponent` (shared) to navigate between pipeline steps
- Set up a `PipelineStateService` (signal-based) to hold state across steps

---

## Phase 1: 3D Model Generation (Step 1)

### 1.1 — Prompt UI Component
**Component**: `features/prompt/prompt.component.ts`

- Text input for character description (e.g. "medieval knight with sword and shield")
- Optional image upload for reference (image-to-3D)
- Settings panel:
  - Art style preset (realistic, stylized, low-poly)
  - Topology preference (quad, triangle)
  - Target polygon count (low/med/high)
  - Symmetry toggle
- "Generate" button with progress indicator

### 1.2 — Backend: Meshy API Integration
**Endpoint**: `POST /api/generate/model`

- **Primary API: Meshy (meshy.ai)**
  - `POST https://api.meshy.ai/openapi/v2/text-to-3d` — create task
  - `GET https://api.meshy.ai/openapi/v2/text-to-3d/{taskId}` — poll status
  - Returns GLB/FBX with textures and optional rigging
  - Meshy-6 model supports automatic rigging for humanoid characters
- **Fallback API: Tripo (tripo3d.ai)**
  - `POST https://api.tripo3d.ai/v2/openapi/task` — create task
  - Similar polling mechanism
  - Also supports rigging and retopology
- Poll for completion (typically 30-120 seconds)
- Download GLB file and store in `server/assets/models/`
- Return model URL + metadata to frontend

### 1.3 — Model Preview
- After generation, show a quick Three.js preview of the model
- Allow user to approve or regenerate
- Display model stats (polycount, has-rig, texture count)

### 1.4 — Auto-Rigging (if model is unrigged)
- If the generated model lacks a skeleton:
  - Use Meshy's rigging API (`POST /openapi/v1/rig`) or
  - Use Tripo's rigging endpoint
  - Or use Mixamo-compatible auto-rigging via AccuRIG API
- Store rigged model, proceed to Step 2

---

## Phase 2: 3D Animation Editor (Step 2)

### 2.1 — Three.js Scene Setup
**Component**: `features/editor/editor.component.ts`

- Load GLB model using `GLTFLoader`
- Set up scene: camera, lights (ambient + directional), ground plane
- Orbit controls for user camera manipulation
- Display skeleton overlay using `SkeletonHelper`
- Render loop managed by Angular's `afterNextRender` / `requestAnimationFrame`

### 2.2 — Animation Library (Presets)
**Service**: `core/services/animation.service.ts`

Store a library of reusable animation clips in `assets/animations/`:

| Animation | File | Frames | Loop |
|-----------|------|--------|------|
| Idle      | idle.glb | 30 | yes |
| Walk      | walk.glb | 24 | yes |
| Run       | run.glb | 20 | yes |
| Attack    | attack.glb | 15 | no |
| Jump      | jump.glb | 20 | no |
| Die       | die.glb | 25 | no |
| Cast      | cast.glb | 20 | no |

- Source animations from Mixamo (free, FBX/GLB)
- Use `THREE.AnimationUtils.clone()` and retarget with `SkeletonUtils.retarget()`
- Store animation clips as separate GLB files with only animation data

### 2.3 — Animation Timeline (Theatre.js)
- Integrate Theatre.js Studio for visual timeline editing
- Display current animation on timeline with keyframes
- Allow basic adjustments:
  - Playback speed
  - Trim start/end frames
  - Frame count for export
- Play/Pause/Scrub controls

### 2.4 — Animation Retargeting
**Utility**: `core/utils/animation-retarget.ts`

- Map preset animation skeletons to the generated model's skeleton
- Handle bone name mismatches with a configurable bone mapping
- Use `SkeletonUtils.retargetClip()` from Three.js addons
- Fallback: manual bone mapping UI if auto-mapping fails

### 2.5 — Simple Bone Manipulation (Optional)
- Click a bone to select it
- Rotate selected bone with gizmo (`TransformControls`)
- Record manual keyframes
- This is a "nice-to-have" for v1 — presets are the primary workflow

---

## Phase 3: Frame Capture (Step 3)

### 3.1 — Camera Preset System
**Component**: `features/capture/capture.component.ts`

Define camera angles as presets:

```typescript
interface CameraPreset {
  name: string;           // e.g. "top-down", "side", "isometric"
  position: Vector3;
  rotation: Euler;
  projection: 'perspective' | 'orthographic';
  fov?: number;
}
```

**Built-in presets:**

| Preset | Camera Position | Use Case |
|--------|----------------|----------|
| Top-Down | (0, 10, 0) looking down | Top-down RPGs |
| Side | (10, 1, 0) looking left | Platformers |
| Isometric | (7, 7, 7) 45° angle | Isometric RPGs |
| Front | (0, 1, 10) looking at face | UI portraits |
| 3/4 View | (5, 5, 5) | Classic RPGs |
| Custom | User-defined | Any |

### 3.2 — Direction System
For each camera preset, define character rotation directions:

- **4-direction**: Down (0°), Left (90°), Right (270°), Up (180°)
- **8-direction**: + DownLeft (45°), DownRight (315°), UpLeft (135°), UpRight (225°)
- User selects 4-dir or 8-dir

### 3.3 — Frame Renderer
**Service**: `core/services/frame-capture.service.ts`

- Create an offscreen `WebGLRenderer` (or use existing with `preserveDrawingBuffer`)
- For each `(animation, direction, frame)`:
  1. Set character rotation to direction angle
  2. Set camera to preset position
  3. Advance animation to frame N
  4. Render to canvas
  5. Extract pixel data via `canvas.toDataURL('image/png')`
- Use `requestAnimationFrame` batching to avoid blocking UI
- Show progress bar: `captured X / total frames`

### 3.4 — Capture Settings UI
- Frame size (32x32, 64x64, 128x128, 256x256, custom)
- Background: transparent / solid color
- Anti-aliasing toggle
- Padding around character
- Auto-crop to bounding box option
- Shadow: on/off/baked

### 3.5 — Frame Preview Grid
- Show captured frames in a preview grid
- Allow user to re-capture individual frames
- Highlight any frames that look off

---

## Phase 4: Style Transfer (Step 4)

### 4.1 — Style Selection UI
**Component**: `features/stylize/stylize.component.ts`

Available styles:

| Style | Method | Description |
|-------|--------|-------------|
| Original (3D render) | No processing | Raw Three.js render output |
| Pixel Art | Shader + downscale | Nearest-neighbor downscale → upscale, limited palette |
| Cartoonish | AI img2img | Cel-shaded, bold outlines, flat colors |
| Simplified | AI img2img | Minimal detail, clean shapes |
| Outlined | Shader | Sobel edge detection + flat fill |
| Hand-drawn | AI img2img | Sketch/watercolor appearance |
| Retro 16-bit | Shader + palette | SNES-era color palette, dithering |

### 4.2 — Shader-Based Styles (Client-Side)
**Location**: `assets/shaders/`

For styles that don't need AI:
- **Pixel Art**: Render at low res → nearest-neighbor upscale, apply palette quantization
- **Outlined**: Sobel/Laplacian edge detection post-process
- **Retro 16-bit**: Color palette reduction + ordered dithering

Implement as Three.js `ShaderPass` in `EffectComposer` or as 2D Canvas post-processing.

### 4.3 — AI-Based Styles (Server-Side)
**Endpoint**: `POST /api/stylize/frames`

- **Primary: Stability AI (img2img)**
  - `POST https://api.stability.ai/v2beta/stable-image/generate/sd3-turbo`
  - Send each frame with a style prompt (e.g. "pixel art game sprite, 16-bit style")
  - Control strength (denoising) to preserve pose while changing style
  - Batch processing with rate limiting
- **Fallback: Replicate API**
  - Run ControlNet or style-transfer models
  - More flexibility but slower

### 4.4 — Batch Processing
- Process frames in parallel (respect API rate limits)
- Show progress: `styled X / Y frames`
- Cache styled frames — if user re-runs with same style, skip already-processed frames
- Allow style preview on a single frame before committing to full batch

### 4.5 — Style Consistency
- Use the same seed across all frames of an animation for consistent style
- For AI styles: include "consistent style, game sprite, same character" in all prompts
- Post-process: normalize color palette across all frames

---

## Phase 5: Spritesheet Export (Step 5)

### 5.1 — Spritesheet Layout Engine
**Service**: `core/services/spritesheet.service.ts`

Layout rules:
```
Row = Animation + Direction
Columns = Frame index (0, 1, 2, ...)

Row order (configurable):
  Row 0: idle_down
  Row 1: idle_left
  Row 2: idle_right
  Row 3: idle_up
  Row 4: walk_down
  Row 5: walk_left
  Row 6: walk_right
  Row 7: walk_up
  Row 8: attack_down
  ...
```

### 5.2 — Canvas Composition
- Create a single `<canvas>` with dimensions: `(frameWidth * maxFrameCount) x (frameHeight * totalRows)`
- Draw each frame at its grid position
- Support padding between frames (configurable gutter)
- Optionally draw grid lines for debugging

### 5.3 — Export Formats
**Component**: `features/export/export.component.ts`

- **PNG** — standard spritesheet image (primary)
- **JSON metadata** — frame positions, sizes, animation names, durations
  - Compatible with Phaser, PixiJS, Unity, Godot formats
- **ZIP** — individual frame PNGs + metadata
- **GIF preview** — animated preview of each action

### 5.4 — Metadata Format
```json
{
  "spritesheet": "character_spritesheet.png",
  "frameWidth": 64,
  "frameHeight": 64,
  "animations": {
    "idle_down": { "row": 0, "frames": 4, "fps": 8, "loop": true },
    "idle_left": { "row": 1, "frames": 4, "fps": 8, "loop": true },
    "walk_down": { "row": 4, "frames": 6, "fps": 12, "loop": true }
  }
}
```

### 5.5 — Preview & Download UI
- Full spritesheet preview with zoom/pan
- Animated preview: click any animation row to play it
- Download buttons for each format
- "Start Over" / "Modify" buttons to go back to any step

---

## Phase 6: Cross-Cutting Concerns

### 6.1 — Pipeline State Management
**Service**: `core/services/pipeline-state.service.ts`

Use Angular Signals to manage state across all steps:

```typescript
interface PipelineState {
  prompt: string;
  modelUrl: signal<string | null>;
  animations: signal<AnimationConfig[]>;
  capturedFrames: signal<CapturedFrame[]>;
  styledFrames: signal<StyledFrame[]>;
  spritesheetUrl: signal<string | null>;
  currentStep: signal<number>;
}
```

### 6.2 — Error Handling & Retries
- Wrap all API calls in retry logic (3 attempts, exponential backoff)
- Show user-friendly error messages with "Retry" buttons
- Log errors to console with full context for debugging
- Graceful degradation: if style transfer fails, offer unstyled frames

### 6.3 — API Key Management
- Backend reads keys from `.env` (never exposed to frontend)
- Frontend calls backend proxy endpoints only
- Rate limit tracking per API to avoid overages
- Usage dashboard showing API credit consumption

### 6.4 — Asset Cleanup
- Temporary 3D models and frame images stored in `server/assets/temp/`
- Clean up temp files after 24 hours (cron job or on-startup cleanup)
- Final exports stored in `server/assets/exports/`

---

## Implementation Order

| Priority | Task | Est. Complexity | Dependencies |
|----------|------|----------------|--------------|
| 1 | Phase 0: Scaffolding | Low | None |
| 2 | Phase 1.1-1.2: Prompt UI + Meshy API | Medium | Phase 0 |
| 3 | Phase 2.1: Three.js scene + model loading | Medium | Phase 1 |
| 4 | Phase 2.2-2.3: Animation presets + timeline | High | Phase 2.1 |
| 5 | Phase 3.1-3.3: Camera presets + frame capture | Medium | Phase 2 |
| 6 | Phase 5.1-5.3: Spritesheet layout + export | Medium | Phase 3 |
| 7 | Phase 4.1-4.2: Shader styles (client-side) | Medium | Phase 3 |
| 8 | Phase 4.3-4.4: AI style transfer | Medium | Phase 4.2 |
| 9 | Phase 1.3-1.4: Model preview + auto-rigging | Low | Phase 1.2 |
| 10 | Phase 2.5: Manual bone editing | High | Phase 2.3 |
| 11 | Phase 6: Polish & error handling | Medium | All |

---

## API Cost Estimates (per spritesheet)

| Service | Operation | Approx. Cost |
|---------|-----------|-------------|
| Meshy AI | 1 text-to-3D generation | ~$0.10 (10 credits) |
| Meshy AI | 1 rigging task | ~$0.05 (5 credits) |
| Stability AI | Style transfer per frame (~50-100 frames) | ~$0.50-1.00 |
| **Total** | **Per spritesheet** | **~$0.65-1.15** |

---

## Key Technical Decisions

1. **Why Meshy as primary 3D API?** — Best documentation, built-in rigging, GLB output with textures, competitive pricing, Meshy-6 model quality.

2. **Why Three.js over Babylon.js?** — Larger ecosystem, more animation examples, better Theatre.js integration, lighter bundle size.

3. **Why Theatre.js for timeline?** — Purpose-built for Three.js animation, visual studio UI, keyframe editing, free for this use case.

4. **Why hybrid shader + AI for styles?** — Shader styles (pixel art, outlined) are instant and free. AI styles (cartoonish, hand-drawn) need generative models but produce more creative results. Offering both gives best UX.

5. **Why Express backend?** — API keys must stay server-side. Express is minimal, pairs naturally with Angular SSR if needed later, and handles file storage simply.

6. **Why Angular 21?** — User requirement. Angular 21 signals provide excellent reactive state management for the multi-step pipeline. Standalone components keep the architecture clean.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 3D model quality varies | Bad spritesheets | Allow regeneration; offer manual prompt refinement tips |
| Animation retargeting fails | Broken poses | Provide manual bone mapping UI; curate compatible animation library |
| Style transfer inconsistency | Frames look different | Same seed, batch prompts, post-process palette normalization |
| API rate limits | Slow processing | Queue system, progress UI, caching of intermediate results |
| Large file sizes | Slow downloads | Compress PNGs, offer quality settings, lazy-load previews |
| Browser memory (many frames) | Crashes | Process in chunks, use OffscreenCanvas/Web Workers, limit max frames |
