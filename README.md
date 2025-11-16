# Spine Animation Viewer

A modern web-based viewer for Spine animations built with React, TypeScript, PIXI.js, and pixi-spine.

## Features

- 🎨 **Beautiful UI** - Modern dark theme with dark red accents
- 📁 **Multiple Input Methods** - Drag & drop files, file picker, or paste URLs
- 🔗 **URL Fetching** - Paste any Spine asset URL (Ctrl+V) and automatically download all related files (.json, .atlas, images)
- 🎮 **Full Playback Controls** - Play/pause, loop, animation selection, speed control (0.1x - 3x), opacity adjustment
- ⌨️ **Keyboard Shortcuts** - Space (play/pause), R (reset/back)
- 🎯 **Encapsulated Core** - Clean, exportable SpineDisplay class for easy integration

## Required Files

To load a Spine animation, you need:
- **`.json`** - Spine skeleton data
- **`.atlas`** - Texture atlas definition
- **Image file(s)** - `.png`, `.webp`, `.jpg`, or `.jpeg` atlas textures

## Usage

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Loading Animations

### Method 1: File Selection
Click "Select Files" and choose your `.json`, `.atlas`, and image files together.

### Method 2: Drag & Drop
Drag your Spine files directly onto the landing page.

### Method 3: URL Paste (Ctrl+V)
1. Copy a URL to any Spine file (e.g., `https://example.com/animation.json`)
2. Press `Ctrl+V` on the landing page
3. The viewer will automatically download all related files

The URL fetcher will try:
- `.json` for skeleton data
- `.atlas` or `.atlas.txt` for the atlas
- `.png`, `.webp`, `.jpg`, `.jpeg` for images
- Numbered variants (e.g., `image2.png`, `image3.png`)

## Keyboard Shortcuts

- **Space** - Play/Pause animation
- **R** - Return to file selection

## Architecture

### Core Components

- **`SpineDisplay`** (`src/lib/SpineDisplay.ts`) - Encapsulated PIXI.js Spine animation class with clean API
- **`SpineViewer`** (`src/components/SpineViewer.tsx`) - Main viewer component with PIXI integration
- **`Controls`** (`src/components/Controls.tsx`) - Animation control panel
- **`LandingPage`** (`src/components/LandingPage.tsx`) - File selection and URL paste interface
- **`urlFetcher`** (`src/lib/urlFetcher.ts`) - Smart URL-based file downloader

### SpineDisplay API

```typescript
const display = new SpineDisplay({ width: 800, height: 600 });

// Load spine data
display.setSpine(spineData);

// Control animation
display.setAnimation('walk', true); // name, loop
display.setTimeScale(1.5); // speed
display.setAlpha(0.8); // opacity
display.pause();
display.resume();
display.stop();

// Query
const animations = display.getAnimations();
const currentAnim = display.getCurrentAnimation();
```

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **PIXI.js v7** - WebGL rendering
- **pixi-spine v4** - Spine runtime for PIXI
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Sonner** - Toast notifications

## License

MIT

## Credits

Built with ❤️ by ZARDOY
