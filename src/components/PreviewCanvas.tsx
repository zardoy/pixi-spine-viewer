import { useRef, useEffect } from 'react';
import type { GenerateArea, ConfigOptionMeta, PreviewValueResult } from '../../generator/config';

export function PreviewCanvas({ 
  meta, 
  config, 
  isVisible 
}: { 
  meta: ConfigOptionMeta; 
  config: GenerateArea; 
  isVisible: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const timeRef = useRef<number>(0);
  const previewSizeRef = useRef<{ width: number; height: number }>({ width: 200, height: 100 });

  useEffect(() => {
    if (!isVisible || !meta.previewValue || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      if (!meta.previewValue) return;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Call preview function
      const result = meta.previewValue(config, timeRef.current, ctx);
      
      // Update canvas size if needed
      if (result.width && result.height) {
        canvas.width = result.width;
        canvas.height = result.height;
        previewSizeRef.current = { width: result.width, height: result.height };
      }
      
      // Reset time if preview is done
      if (result.done) {
        timeRef.current = 0;
      } else {
        timeRef.current += 0.016; // ~60fps
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVisible, meta, config]);

  if (!meta.previewValue) return null;

  return (
    <canvas
      ref={canvasRef}
      width={previewSizeRef.current.width}
      height={previewSizeRef.current.height}
      className="border border-border rounded bg-background"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
