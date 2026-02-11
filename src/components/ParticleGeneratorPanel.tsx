import { useState, useEffect, useRef, useCallback } from 'react';
import { useSnapshot } from 'valtio';
import { spineViewerStore } from '../store/spineViewerStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { GenerateArea, GeneratorConfig, ConfigOptionMeta } from '../../generator/config';
import { DEFAULT_CONFIG, CONFIG_OPTIONS_META } from '../../generator/config';
import { buildParticleInstances, generateSpineJson, generateAtlas } from '../../generator/particles-generator';
import { toast } from 'sonner';
import { SpineFiles } from '../pages/Index';
import { ConfigFieldWithPreview, MinMaxFieldWithPreview } from './ConfigFieldWithPreview';

// Remove unused PreviewCanvas import - it's used in ConfigFieldWithPreview

const DEFAULT_PARTICLE_IMAGE_SIZE = 44; // Default particle image size

interface ParticleGeneratorPanelProps {
  onFilesGenerated: (files: SpineFiles) => void;
}

// Filter metadata to only include GenerateArea fields (exclude GeneratorConfig-only fields)
// Note: evenTimeKeyframes is handled separately in UI as it's a GeneratorConfig field
const AREA_CONFIG_META = CONFIG_OPTIONS_META.filter(meta => {
  // Exclude evenTimeKeyframes (it's in GeneratorConfig, not GenerateArea) - handled separately
  return meta.key !== 'evenTimeKeyframes';
});

// Generate particle image: circle with shadow/opacity fading
// gradientFadeSpeed: 0 = slow fade (soft), 1 = fast fade (sharp)
function generateParticleImage(size: number, gradientFadeSpeed: number = 0.5): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 2; // Slight padding
  
  // Create radial gradient: white center fading to transparent edges
  // gradientFadeSpeed controls how quickly the fade happens:
  // - Lower values (0-0.3): slow fade, softer edges
  // - Higher values (0.7-1): fast fade, sharper edges
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  
  // Calculate fade stops based on gradientFadeSpeed
  // Core stays opaque longer with lower fade speed
  const coreEnd = Math.max(0.1, 0.5 - gradientFadeSpeed * 0.3);
  const midPoint = Math.max(0.3, 0.7 - gradientFadeSpeed * 0.4);
  const fadeStart = Math.max(0.5, 0.9 - gradientFadeSpeed * 0.3);
  
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // White center, fully opaque
  gradient.addColorStop(coreEnd, 'rgba(255, 255, 255, 1)'); // Stay opaque in core
  gradient.addColorStop(midPoint, `rgba(255, 255, 255, ${1 - gradientFadeSpeed * 0.5})`); // Mid fade
  gradient.addColorStop(fadeStart, `rgba(255, 255, 255, ${0.3 - gradientFadeSpeed * 0.2})`); // More fade
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Fully transparent edges
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  return canvas;
}

// PreviewCanvas is now in a separate file

export const ParticleGeneratorPanel = ({ onFilesGenerated }: ParticleGeneratorPanelProps) => {
  const state = useSnapshot(spineViewerStore);

  // Initialize panel position if not set
  useEffect(() => {
    if (state.ui.particleGeneratorPanelPos === null) {
      spineViewerStore.ui.particleGeneratorPanelPos = { x: 0, y: 0 };
    }
  }, []);

  // Use default config from generator/config.ts
  const [config, setConfig] = useState<GenerateArea>(
    DEFAULT_CONFIG.generateAreas[0] || {
      spawnArea: { x: [0, 1000], y: [0, 1000] },
      particleCount: 190,
      maxParticleLife: [0.3, 0.7],
      travelDistance: [400, 1000],
      timelineDuration: 3,
      particleSize: [1, 2],
      loop: false, // Disabled for UI by default
    }
  );
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [showSpawnBounds, setShowSpawnBounds] = useState(false);
  const [gradientFadeSpeed, setGradientFadeSpeed] = useState(0.5); // 0 = slow/soft, 1 = fast/sharp
  const [evenTimeKeyframes, setEvenTimeKeyframes] = useState<number>(0); // 0 = disabled
  const generateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerLockActiveRef = useRef<string | null>(null);
  const pointerLockValueRef = useRef<{ key: string; startValue: number; sensitivity: number; minMaxIndex?: number } | null>(null);
  const pointerLockDragStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const DRAG_THRESHOLD = 5; // pixels
  const DRAG_TIME_THRESHOLD = 100; // ms

  const pos = state.ui.particleGeneratorPanelPos ?? { x: 0, y: 0 };
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Helper to get config value by key
  const getConfigValue = useCallback((key: string): any => {
    if (key === 'spawnAreaX') return config.spawnArea.x;
    if (key === 'spawnAreaY') return config.spawnArea.y;
    return (config as any)[key];
  }, [config]);

  // Helper to update config value by key
  const setConfigValue = useCallback((key: string, value: any) => {
    if (key === 'spawnAreaX') {
      setConfig((prev) => ({ ...prev, spawnArea: { ...prev.spawnArea, x: value } }));
    } else if (key === 'spawnAreaY') {
      setConfig((prev) => ({ ...prev, spawnArea: { ...prev.spawnArea, y: value } }));
    } else {
      setConfig((prev) => ({ ...prev, [key]: value }));
    }
  }, []);

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't start panel drag if clicking on input fields
    const target = e.target as any;
    if (target?.tagName === 'INPUT' || target?.closest?.('input')) {
      return;
    }
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    if (!spineViewerStore.ui.particleGeneratorPanelPos) {
      spineViewerStore.ui.particleGeneratorPanelPos = { x: 0, y: 0 };
    }
    spineViewerStore.ui.particleGeneratorPanelPos = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    };
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
    window.removeEventListener('pointermove', handleMouseMove);
    window.removeEventListener('pointerup', handleMouseUp);
  };

  // Pointer lock for numeric field dragging
  const handleNumericFieldMouseDown = useCallback((
    e: React.MouseEvent<HTMLInputElement>,
    meta: ConfigOptionMeta,
    currentValue: number,
    isMinMax: boolean,
    minMaxIndex?: number
  ) => {
    // Don't prevent default - allow normal input focus/selection
    // Track mouse down position to detect dragging
    pointerLockDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now(),
    };
    
    const input = e.currentTarget;
    const sensitivity = meta.step ? meta.step * 10 : 1;
    
    // Store initial state for potential pointer lock
    pointerLockValueRef.current = {
      key: meta.key,
      startValue: currentValue,
      sensitivity,
    };
    
    if (isMinMax && minMaxIndex !== undefined) {
      const arrValue = getConfigValue(meta.key) as [number, number];
      pointerLockValueRef.current.startValue = arrValue[minMaxIndex];
      pointerLockValueRef.current.minMaxIndex = minMaxIndex;
    }
    
    // Handle mouse move to detect drag
    const handleMouseMoveForDrag = (moveEvent: MouseEvent) => {
      if (!pointerLockDragStartRef.current) return;
      
      const dx = Math.abs(moveEvent.clientX - pointerLockDragStartRef.current.x);
      const dy = Math.abs(moveEvent.clientY - pointerLockDragStartRef.current.y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeElapsed = Date.now() - pointerLockDragStartRef.current.timestamp;
      
      // If mouse moved enough, request pointer lock
      if (distance > DRAG_THRESHOLD || timeElapsed > DRAG_TIME_THRESHOLD) {
        const inputEl = input as any;
        if (inputEl.requestPointerLock && !document.pointerLockElement) {
          inputEl.requestPointerLock().then(() => {
            pointerLockActiveRef.current = meta.key;
          }).catch((err: any) => {
            console.error('Pointer lock failed:', err);
          });
        }
        window.removeEventListener('mousemove', handleMouseMoveForDrag);
        window.removeEventListener('mouseup', handleMouseUpForDrag);
      }
    };
    
    const handleMouseUpForDrag = () => {
      pointerLockDragStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMoveForDrag);
      window.removeEventListener('mouseup', handleMouseUpForDrag);
    };
    
    window.addEventListener('mousemove', handleMouseMoveForDrag);
    window.addEventListener('mouseup', handleMouseUpForDrag);
  }, [getConfigValue]);

  // Handle pointer lock movement and release
  useEffect(() => {
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        pointerLockActiveRef.current = null;
        pointerLockValueRef.current = null;
        pointerLockDragStartRef.current = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!pointerLockValueRef.current || !pointerLockActiveRef.current) return;
      if (!document.pointerLockElement) return;
      
      const { key, startValue, sensitivity, minMaxIndex } = pointerLockValueRef.current;
      const meta = AREA_CONFIG_META.find(m => m.key === key);
      if (!meta) return;

      const delta = e.movementX * sensitivity;
      const newValue = Math.max(
        meta.min ?? -Infinity,
        Math.min(meta.max ?? Infinity, startValue + delta)
      );

      if (key === 'spawnAreaX' || key === 'spawnAreaY') {
        const arrValue = getConfigValue(key) as [number, number];
        const index = key === 'spawnAreaX' ? 0 : 1;
        const newArr = [...arrValue] as [number, number];
        newArr[index] = newValue;
        setConfigValue(key, newArr);
        pointerLockValueRef.current.startValue = newValue;
      } else if (meta.type === 'minMax') {
        const arrValue = getConfigValue(key) as [number, number];
        const index = minMaxIndex ?? 0;
        const newArr = [...arrValue] as [number, number];
        newArr[index] = newValue;
        setConfigValue(key, newArr);
        pointerLockValueRef.current.startValue = newValue;
      } else {
        setConfigValue(key, newValue);
        pointerLockValueRef.current.startValue = newValue;
      }
    };

    const handleMouseUp = () => {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }, [config, getConfigValue, setConfigValue]); // Include config and helpers to access latest values

  const generateParticles = useCallback(async () => {
    try {
      const generatorConfig: GeneratorConfig = {
        generateAreas: [config],
        defaultMaxParticleLife: [0.3, 0.7],
        defaultTimelineDuration: 5,
        defaultTravelDistance: [400, 1200],
        evenTimeKeyframes: evenTimeKeyframes > 0 ? evenTimeKeyframes : undefined,
      };

      const imageWidth = DEFAULT_PARTICLE_IMAGE_SIZE;
      const imageHeight = DEFAULT_PARTICLE_IMAGE_SIZE;

      const instances = buildParticleInstances([config], generatorConfig);
      const hasLoop = config.loop ?? false;
      const totalDuration = hasLoop
        ? config.timelineDuration ?? 5
        : (config.timelineDuration ?? 5) + (config.maxParticleLife?.[1] ?? 0.7);

      const spineJson = generateSpineJson(
        instances,
        imageWidth,
        imageHeight,
        totalDuration,
        'particle.png',
        hasLoop,
        evenTimeKeyframes > 0 ? evenTimeKeyframes : undefined
      );

      const atlasText = generateAtlas('particle.png', imageWidth, imageHeight);

      // Generate particle image: circle with shadow/opacity fading
      const particleCanvas = generateParticleImage(imageWidth, gradientFadeSpeed);
      
      particleCanvas.toBlob((blob) => {
        if (!blob) {
          toast.error('Failed to create particle image');
          return;
        }

        const imageFile = new File([blob], 'particle.png', { type: 'image/png' });
        const jsonFile = new File([JSON.stringify(spineJson, null, 2)], 'particles.json', { type: 'application/json' });
        const atlasFile = new File([atlasText], 'particles.atlas', { type: 'text/plain' });

        const files: SpineFiles = {
          jsonFile,
          atlasFile,
          imageFiles: [imageFile],
        };

        // Update spawn bounds in store for visualization
        spineViewerStore.ui.showSpawnBounds = showSpawnBounds;
        if (showSpawnBounds) {
          spineViewerStore.ui.spawnBounds = config.spawnArea;
        } else {
          spineViewerStore.ui.spawnBounds = null;
        }

        onFilesGenerated(files);
        toast.success(`Generated ${instances.length} particles`);
      }, 'image/png');
    } catch (error) {
      console.error('Particle generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate particles');
    }
  }, [config, showSpawnBounds, gradientFadeSpeed, evenTimeKeyframes, onFilesGenerated]);

  // Auto-generate with throttling
  useEffect(() => {
    if (autoGenerate) {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current);
      }
      generateTimeoutRef.current = setTimeout(() => {
        generateParticles();
      }, 300);
    }
    return () => {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current);
      }
    };
  }, [config, autoGenerate, generateParticles]);


  // Render a config field based on metadata
  const renderConfigField = (meta: ConfigOptionMeta) => {
    const value = getConfigValue(meta.key);

    switch (meta.type) {
      case 'number': {
        const numValue = typeof value === 'number' ? value : (meta.default ?? 0);
        if (meta.disabled) {
          return (
            <div key={meta.key} className="opacity-50">
              <Label className="text-xs">{meta.label || meta.key}</Label>
              {meta.description && <div className="text-[10px] text-muted-foreground mb-1">{meta.description}</div>}
              <Input
                type="number"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={numValue}
                disabled
                className="h-8 text-xs"
              />
            </div>
          );
        }
        return (
          <ConfigFieldWithPreview
            key={meta.key}
            meta={meta}
            value={numValue}
            config={config}
            onValueChange={(val) => setConfigValue(meta.key, val)}
            onMouseDown={(e) => handleNumericFieldMouseDown(e, meta, numValue, false)}
            title="Click and drag left/right to adjust value"
          />
        );
      }

      case 'minMax': {
        const arrValue = Array.isArray(value) ? value : [meta.min ?? 0, meta.max ?? 100];
        if (meta.disabled) {
          return (
            <div key={meta.key} className="opacity-50">
              <Label className="text-xs">{meta.label || meta.key}</Label>
              {meta.description && <div className="text-[10px] text-muted-foreground mb-1">{meta.description}</div>}
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  value={arrValue[0]}
                  disabled
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  value={arrValue[1]}
                  disabled
                  className="h-8 text-xs"
                />
              </div>
            </div>
          );
        }
        return (
          <MinMaxFieldWithPreview
            key={meta.key}
            meta={meta}
            value={arrValue as [number, number]}
            config={config}
            onValueChange={(val) => setConfigValue(meta.key, val)}
            onMinMouseDown={(e) => handleNumericFieldMouseDown(e, meta, arrValue[0], true, 0)}
            onMaxMouseDown={(e) => handleNumericFieldMouseDown(e, meta, arrValue[1], true, 1)}
          />
        );
      }

      case 'checkbox': {
        const boolValue = typeof value === 'boolean' ? value : (meta.default ?? false);
        return (
          <div key={meta.key} className="flex items-center gap-2">
            <Checkbox
              id={meta.key}
              checked={boolValue}
              disabled={meta.disabled}
              onCheckedChange={(checked) => setConfigValue(meta.key, checked === true)}
            />
            <Label htmlFor={meta.key} className={`text-xs ${meta.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              {meta.label || meta.key}
            </Label>
            {meta.description && <span className="text-[10px] text-muted-foreground">({meta.description})</span>}
          </div>
        );
      }

      case 'select': {
        if (!meta.options || meta.options.length === 0) return null;
        const currentValue = typeof value === 'string' ? value : (meta.default ?? meta.options[0]?.value ?? '');
        return (
          <div key={meta.key} className={meta.disabled ? 'opacity-50' : ''}>
            <Label className="text-xs">{meta.label || meta.key}</Label>
            {meta.description && <div className="text-[10px] text-muted-foreground mb-1">{meta.description}</div>}
            <Select
              value={currentValue}
              disabled={meta.disabled}
              onValueChange={(val) => setConfigValue(meta.key, val)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meta.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className="fixed z-30 bg-card/95 text-xs text-card-foreground border border-border rounded-md shadow-lg p-4 space-y-3 cursor-move min-w-[300px] max-w-[400px]"
      style={{ bottom: 16, left: 16, transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={handleMouseDown}
    >
      <div className="font-semibold text-sm mb-2">Particle Generator</div>

      <div className="space-y-2">
        {AREA_CONFIG_META.map((meta, index) => {
          // Group spawnAreaX and spawnAreaY together
          if (meta.key === 'spawnAreaX') {
            const spawnAreaYMeta = AREA_CONFIG_META.find(m => m.key === 'spawnAreaY');
            return (
              <div key="spawnArea" className="grid grid-cols-2 gap-2">
                {renderConfigField(meta)}
                {spawnAreaYMeta && renderConfigField(spawnAreaYMeta)}
              </div>
            );
          }
          // Skip spawnAreaY as it's rendered with spawnAreaX
          if (meta.key === 'spawnAreaY') {
            return null;
          }
          // Group minMax fields in pairs when possible (skip if already paired)
          if (meta.type === 'minMax') {
            const prevMeta = index > 0 ? AREA_CONFIG_META[index - 1] : null;
            // If previous was also minMax and not spawnArea, we already rendered this pair
            if (prevMeta?.type === 'minMax' && prevMeta.key !== 'spawnAreaX' && prevMeta.key !== 'spawnAreaY') {
              return null;
            }
            const nextMeta = index < AREA_CONFIG_META.length - 1 ? AREA_CONFIG_META[index + 1] : null;
            // If next is also minMax (and not spawnArea), render as pair
            if (nextMeta?.type === 'minMax' && nextMeta.key !== 'spawnAreaX' && nextMeta.key !== 'spawnAreaY') {
              return (
                <div key={`${meta.key}-pair`} className="grid grid-cols-2 gap-2">
                  {renderConfigField(meta)}
                  {renderConfigField(nextMeta)}
                </div>
              );
            }
          }
          return renderConfigField(meta);
        })}

        {/* Gradient Fade Speed Control */}
        <div>
          <Label className="text-xs">Gradient Fade Speed</Label>
          <div className="text-[10px] text-muted-foreground mb-1">0 = slow/soft, 1 = fast/sharp</div>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={gradientFadeSpeed}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setGradientFadeSpeed(isNaN(val) ? 0.5 : Math.max(0, Math.min(1, val)));
            }}
            className="h-8 text-xs"
          />
        </div>

        {/* Even Time Keyframes Control */}
        <div>
          <Label className="text-xs">Even Time Keyframes (seconds)</Label>
          <div className="text-[10px] text-muted-foreground mb-1">Snap keyframes to grid (0 = disabled)</div>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={evenTimeKeyframes}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setEvenTimeKeyframes(isNaN(val) ? 0 : Math.max(0, Math.min(1, val)));
            }}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="showBounds"
            checked={showSpawnBounds}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              setShowSpawnBounds(isChecked);
              spineViewerStore.ui.showSpawnBounds = isChecked;
              spineViewerStore.ui.spawnBounds = isChecked ? config.spawnArea : null;
            }}
          />
          <Label htmlFor="showBounds" className="text-xs cursor-pointer">Show Spawn Bounds</Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="autoGenerate"
            checked={autoGenerate}
            onCheckedChange={(checked) => setAutoGenerate(checked === true)}
          />
          <Label htmlFor="autoGenerate" className="text-xs cursor-pointer">Auto-generate (300ms throttle)</Label>
        </div>

        <Button
          onClick={generateParticles}
          className="w-full"
          size="sm"
          disabled={autoGenerate}
        >
          Generate
        </Button>
      </div>
    </div>
  );
};
