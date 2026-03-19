# Spritesheet AI Generator

A web service that generates game-ready spritesheets from a text prompt — fully automated pipeline from AI-powered 3D model generation through animation, frame capture, and artistic stylization.

## Tech Stack

- **Frontend**: Angular 21 (standalone components, signals)
- **3D Engine**: Three.js with Theatre.js for animation timeline
- **Backend**: Node.js / Express (API proxy & asset storage)
- **AI Services**: Tripo API (3D generation), Stability AI (style transfer)

## Getting Started

```bash
# Install dependencies
npm install

# Configure API keys
cp .env.example .env
# Edit .env with your API keys

# Start development (frontend + backend)
npm run dev

# Open http://localhost:4200
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Angular (4200) + Express (3000) together |
| `npm run client` | Angular dev server only |
| `npm run server` | Express server only |
| `npm run build` | Production build |
| `npm test` | Run tests |

## Pipeline

```
Text Prompt → 3D Model (AI) → Skeleton Animation → Frame Capture → Style Transfer → Spritesheet
```

## Project Structure

```
src/app/
  core/           # Services, models, guards
  shared/         # Reusable components (stepper, loading)
  layout/         # App shell (header + stepper + content)
  features/       # Feature pages
    prompt/       # Step 1: Text prompt & generation settings
    editor/       # Step 2: 3D viewer & animation editor
    capture/      # Step 3: Frame capture configuration
    stylize/      # Step 4: Style selection & transfer
    export/       # Step 5: Spritesheet preview & download
server/           # Express backend (API proxy)
```

## License

MIT
