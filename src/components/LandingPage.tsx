import { Upload, FileImage, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import { SpineFiles } from "../pages/Index";
import { fetchSpineFilesFromUrl, isValidSpineUrl } from "../lib/urlFetcher";
import { SPINE_EXAMPLES } from "../lib/spineExamples";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface LandingPageProps {
  onFilesSelect: (files: SpineFiles) => void;
}

export const LandingPage = ({ onFilesSelect }: LandingPageProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedExample, setSelectedExample] = useState<string>("");

  const processFiles = async (files: File[]) => {
    // Find skeleton file (.json or .skel), Atlas, and image files
    const skeletonFile = files.find(f => f.name.endsWith('.json') || f.name.endsWith('.skel'));
    const atlasFile = files.find(f => f.name.endsWith('.atlas') || f.name.endsWith('.atlas.txt'));
    const imageFiles = files.filter(f =>
      f.type.startsWith("image/") ||
      f.name.match(/\.(png|jpg|jpeg|webp)$/i)
    );

    if (!skeletonFile) {
      toast.error("No .json or .skel file found. Please include the Spine skeleton file.");
      return;
    }

    if (!atlasFile) {
      toast.error("No .atlas file found. Please include the Spine atlas file.");
      return;
    }

    if (imageFiles.length === 0) {
      toast.error("No image files found. Please include at least one atlas image (.png, .webp, .jpg).");
      return;
    }

    toast.success(`Loaded: ${skeletonFile.name}, ${atlasFile.name}, and ${imageFiles.length} image(s)`);
    onFilesSelect({
      jsonFile: skeletonFile, // Keep the prop name as jsonFile for compatibility
      atlasFile,
      imageFiles,
    });
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
  };

  const handleFilesClick = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);

    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePaste = async (e: ClipboardEvent) => {
    const rawText = e.clipboardData?.getData('text');
    const text = rawText?.split(/[?#]/)[0] || rawText;

    if (text && isValidSpineUrl(text)) {
      e.preventDefault();
      toast.loading('Downloading Spine files from URL...');

      try {
        const files = await fetchSpineFilesFromUrl(text);
        toast.dismiss();
        toast.success(`Downloaded: ${files.jsonFile.name}, ${files.atlasFile.name}, and ${files.imageFiles.length} image(s)`);
        onFilesSelect(files);
      } catch (error) {
        toast.dismiss();
        toast.error(error instanceof Error ? error.message : 'Failed to download files from URL');
      }
    }
  };

  // Add paste and drag/drop event listeners
  useEffect(() => {
    window.addEventListener('paste', handlePaste as any);
    window.addEventListener('drop', handleDrop as any);
    window.addEventListener('dragover', handleDragOver as any);
    window.addEventListener('dragenter', handleDragEnter as any);
    window.addEventListener('dragleave', handleDragLeave as any);

    return () => {
      window.removeEventListener('paste', handlePaste as any);
      window.removeEventListener('drop', handleDrop as any);
      window.removeEventListener('dragover', handleDragOver as any);
      window.removeEventListener('dragenter', handleDragEnter as any);
      window.removeEventListener('dragleave', handleDragLeave as any);
    };
  }, []);

  // Handle P key to load first example
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Check if P key is pressed (not when modifier keys are held)
      if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();

        // Load first example
        if (SPINE_EXAMPLES.length > 0) {
          const firstExample = SPINE_EXAMPLES[0];
          setSelectedExample(firstExample.name);

          // Load the example
          toast.loading(`Loading ${firstExample.name}...`);

          fetchSpineFilesFromUrl(firstExample.jsonUrl, firstExample.atlasUrl)
            .then((files) => {
              toast.dismiss();
              toast.success(`Loaded ${firstExample.name}`);
              onFilesSelect(files);
            })
            .catch((error) => {
              toast.dismiss();
              toast.error(error instanceof Error ? error.message : 'Failed to load example');
            });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFilesSelect]);

  const handleLoadExample = async () => {
    if (!selectedExample) {
      toast.error('Please select an example');
      return;
    }

    const example = SPINE_EXAMPLES.find(ex => ex.name === selectedExample);
    if (!example) return;

    toast.loading(`Loading ${example.name}...`);

    try {
      const files = await fetchSpineFilesFromUrl(example.jsonUrl, example.atlasUrl);
      toast.dismiss();
      toast.success(`Loaded ${example.name}`);
      onFilesSelect(files);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to load example');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary relative">
      {/* File picker input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      {/* ZARDOY Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-[20rem] font-bold italic text-white opacity-[0.03] select-none tracking-wider" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
          ZARDOY
        </div>
      </div>
      <Card className="max-w-2xl w-full p-12 text-center border-2 border-dashed border-border hover:border-primary/50 transition-colors relative z-10">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-foreground">
              Spine Animation Viewer
            </h1>
            <p className="text-lg text-muted-foreground">
              Open to view exported Spine animation files online
            </p>
            <p className="text-sm text-muted-foreground">
              Load <span className="text-primary font-medium">.skel</span>, <span className="text-primary font-medium">.json</span>, and <span className="text-primary font-medium">.atlas</span> files from your computer or URL. Preview and test your Spine animations in the browser.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-muted-foreground">
              Drag and drop files here or
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={handleFilesClick}
                size="lg"
                className="gap-2 font-semibold"
              >
                <FileImage className="w-5 h-5" />
                Select Files
              </Button>
            </div>
          </div>

          <div className="pt-6 border-t border-border space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Try an Example
              </p>
              <div className="flex gap-2 items-center justify-center">
                <Select value={selectedExample} onValueChange={setSelectedExample}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select an example..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SPINE_EXAMPLES.map((example) => (
                      <SelectItem key={example.name} value={example.name}>
                        {example.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleLoadExample}
                  variant="outline"
                  disabled={!selectedExample}
                  className="gap-2"
                >
                  Load Example
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-accent flex items-center justify-center gap-2">
                <span className="font-semibold">💡 Tip:</span>
                <span className="text-muted-foreground">
                  Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground">Ctrl+V</kbd> to paste a URL to any file (.json, .atlas, or image) and we'll download all related files automatically
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground">P</kbd> to load first example,
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground mx-1">R</kbd> to reset,
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground mx-1">Space</kbd> to play/pause,
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground mx-1">Q</kbd> to switch to previous animation
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
