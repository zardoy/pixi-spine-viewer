import { Upload, FileImage, Sparkles, TestTube, FolderSync, Sparkles as SparklesIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import { getBlankParticleFiles, SpineFiles } from "../pages/Index";
import { fetchSpineFilesFromUrl, isValidSpineUrl } from "../lib/urlFetcher";
import {
  SPINE_EXAMPLES,
  loadSpineExampleFiles,
  buildExampleViewerSearchParams,
  openSpineExample,
} from "../lib/spineExamples";
import { ref } from "valtio";
import { spineViewerStore } from "../store/spineViewerStore";
import type { LocalSpineEntry } from "../lib/localSpineFolderScan";
import {
  scanSpineFoldersFromDataTransfer,
  isLikelyFolderDrop,
} from "../lib/localSpineFolderScan";
import JSZip from "jszip";
import { SUPPORTED_SPINE_VERSIONS_TEXT } from "../lib/spineRuntime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { AppServiceWorkerStatus } from "./AppServiceWorkerStatus";

interface LandingPageProps {
  onFilesSelect: (files: SpineFiles) => void;
  onMultipleSkeletonsFound?: (pending: { skeletonFiles: File[]; atlasFile: File; imageFiles: File[] }) => void;
  onSpineFolderExplore?: (entries: LocalSpineEntry[], folderName: string) => void;
}

export const LandingPage = ({ onFilesSelect, onMultipleSkeletonsFound, onSpineFolderExplore }: LandingPageProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedExample, setSelectedExample] = useState<string>("");

  /**
   * Extract files from a ZIP archive
   */
  const extractZipFiles = async (zipFile: File): Promise<File[]> => {
    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(zipFile);
      const extractedFiles: File[] = [];

      for (const filename in zipContent.files) {
        const zipEntry = zipContent.files[filename];
        // Skip directories
        if (zipEntry.dir) continue;

        const blob = await zipEntry.async("blob");
        const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
        extractedFiles.push(file);
      }

      return extractedFiles;
    } catch (error) {
      throw new Error(`Failed to extract ZIP file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const processFiles = async (files: File[]) => {
    // Check if any files are ZIP files
    const zipFiles = files.filter(f => f.name.endsWith('.zip'));
    let allFiles = [...files];

    // Extract ZIP files and add their contents
    for (const zipFile of zipFiles) {
      try {
        toast.loading(`Extracting ${zipFile.name}...`);
        const extractedFiles = await extractZipFiles(zipFile);
        allFiles = allFiles.filter(f => f !== zipFile); // Remove the ZIP file itself
        allFiles.push(...extractedFiles); // Add extracted files
      } catch (error) {
        toast.dismiss();
        toast.error(error instanceof Error ? error.message : 'Failed to extract ZIP file');
        return;
      }
    }

    // Find skeleton files (.json or .skel), Atlas, and image files
    const skeletonFiles = allFiles.filter(f => f.name.endsWith('.json') || f.name.endsWith('.skel'));
    const atlasFile = allFiles.find(f => f.name.endsWith('.atlas') || f.name.endsWith('.atlas.txt'));
    const imageFiles = allFiles.filter(f =>
      f.type.startsWith("image/") ||
      f.name.match(/\.(png|jpg|jpeg|webp)$/i)
    );

    if (skeletonFiles.length === 0) {
      toast.dismiss();
      toast.error("No .json or .skel file found. Please include the Spine skeleton file.");
      return;
    }

    if (!atlasFile) {
      toast.dismiss();
      toast.error("No .atlas file found. Please include the Spine atlas file.");
      return;
    }

    if (imageFiles.length === 0) {
      toast.dismiss();
      toast.error("No image files found. Please include at least one atlas image (.png, .webp, .jpg).");
      return;
    }

    toast.dismiss();

    if (skeletonFiles.length > 1 && onMultipleSkeletonsFound) {
      onMultipleSkeletonsFound({ skeletonFiles, atlasFile, imageFiles });
      return;
    }

    const skeletonFile = skeletonFiles[0];
    spineViewerStore.syncedDir = null;
    spineViewerStore.refs.syncedDirHandles = null;
    spineViewerStore.ui.particleGeneratorPanelVisible = false;
    onFilesSelect({
      jsonFile: skeletonFile,
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

  const handleOpenSyncedDirectory = async () => {
    if (!("showDirectoryPicker" in window)) {
      toast.error("Synced directory requires a modern browser (Chrome/Edge)");
      return;
    }
    try {
      toast.loading("Select directory...");
      const dirHandle = await (window as any).showDirectoryPicker();
      const filesByName = new Map<string, FileSystemFileHandle>();

      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file") {
          filesByName.set(name, handle as FileSystemFileHandle);
        }
      }

      const skeletonFile = Array.from(filesByName.keys()).find(
        (n) => n.endsWith(".json") || n.endsWith(".skel")
      );
      const atlasFile = Array.from(filesByName.keys()).find(
        (n) => n.endsWith(".atlas") || n.endsWith(".atlas.txt")
      );

      if (!skeletonFile) {
        toast.dismiss();
        toast.error("No .json or .skel file found in directory");
        return;
      }
      if (!atlasFile) {
        toast.dismiss();
        toast.error("No .atlas file found in directory");
        return;
      }

      const jsonHandle = filesByName.get(skeletonFile)!;
      const atlasHandle = filesByName.get(atlasFile)!;

      const atlasFileObj = await atlasHandle.getFile();
      const atlasText = await atlasFileObj.text();
      const imageNames: string[] = [];
      const lines = atlasText.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (
          line &&
          (line.endsWith(".png") ||
            line.endsWith(".jpg") ||
            line.endsWith(".jpeg") ||
            line.endsWith(".webp"))
        ) {
          const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
          if (nextLine.startsWith("size:")) {
            imageNames.push(line);
          }
        }
      }
      let imageHandles = imageNames
        .map((n) => filesByName.get(n))
        .filter(Boolean) as FileSystemFileHandle[];
      if (imageHandles.length === 0) {
        const fallback = Array.from(filesByName.entries()).find(([n]) =>
          /\.(png|jpg|jpeg|webp)$/i.test(n)
        );
        if (fallback) imageHandles = [fallback[1]];
      }
      if (imageHandles.length === 0) {
        toast.dismiss();
        toast.error("No image files found in directory");
        return;
      }

      const jsonFile = await jsonHandle.getFile();
      const atlasFileObj2 = await atlasHandle.getFile();
      const imageFiles = await Promise.all(
        imageHandles.map((h) => h.getFile())
      );

      spineViewerStore.syncedDir = true;
      spineViewerStore.refs.syncedDirHandles = ref({
        jsonHandle,
        atlasHandle,
        imageHandles,
      });
      spineViewerStore.reloadPreserveAnimation = null;
      spineViewerStore.ui.particleGeneratorPanelVisible = false;

      onFilesSelect({
        jsonFile,
        atlasFile: atlasFileObj2,
        imageFiles,
      });

      toast.dismiss();
      toast.success("Synced directory opened (JSON changes will auto-reload)");
    } catch (err) {
      toast.dismiss();
      if ((err as Error).name !== "AbortError") {
        toast.error((err as Error).message || "Failed to open directory");
      }
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (!dt) return;

    if (onSpineFolderExplore && isLikelyFolderDrop(dt)) {
      try {
        toast.loading('Scanning folder for spines...');
        const entries = await scanSpineFoldersFromDataTransfer(dt);
        toast.dismiss();
        if (entries.length > 0) {
          const rel = (dt.files[0] as File & { webkitRelativePath?: string } | undefined)?.webkitRelativePath;
          const folderName =
            (rel?.includes('/') ? rel.split('/')[0] : undefined) ??
            dt.items?.[0]?.webkitGetAsEntry?.()?.name ??
            'Folder';
          toast.success(`Found ${entries.length} spine${entries.length === 1 ? '' : 's'}`);
          onSpineFolderExplore(entries, folderName);
          return;
        }
        toast.info('No spine folders found in dropped directory');
      } catch (error) {
        toast.dismiss();
        toast.error(error instanceof Error ? error.message : 'Failed to read folder');
        return;
      }
    }

    const files = Array.from(dt.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent) => {
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
        spineViewerStore.syncedDir = null;
        spineViewerStore.refs.syncedDirHandles = null;
        spineViewerStore.ui.particleGeneratorPanelVisible = false;
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
  }, [onSpineFolderExplore]);

  const loadExampleInViewer = async (example: typeof SPINE_EXAMPLES[number]) => {
    if (example.spineVersion === '4.2') {
      toast.info(`Opening ${example.name} on Spine 4.2 viewer...`);
      openSpineExample(example);
      return;
    }

    try {
      const toastId = toast.loading(`Loading ${example.name}...`);
      const spineFiles = await loadSpineExampleFiles(example);
      const params = buildExampleViewerSearchParams(example);
      window.history.pushState({}, '', `?${params.toString()}`);
      spineViewerStore.syncedDir = null;
      spineViewerStore.refs.syncedDirHandles = null;
      spineViewerStore.ui.particleGeneratorPanelVisible = false;
      toast.dismiss(toastId);
      onFilesSelect(spineFiles);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to load example');
    }
  };

  // Handle P key to load first example
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      if ((target as any).tagName === 'INPUT' || (target as any).tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Check if P key is pressed (not when modifier keys are held)
      if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();

        if (SPINE_EXAMPLES.length > 0) {
          const firstExample = SPINE_EXAMPLES[0];
          setSelectedExample(firstExample.name);
          void loadExampleInViewer(firstExample);
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

    await loadExampleInViewer(example);
  };

  const handleOpenTester = () => {
    window.location.href = '?tester';
  };

  const handleOpenParticleGenerator = () => {
    // Sync URL so reload restores generator view
    window.history.replaceState({}, "", `${window.location.pathname}?generator=1`);
    spineViewerStore.ui.particleGeneratorPanelVisible = true;
    onFilesSelect(getBlankParticleFiles());
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary relative">
      <AppServiceWorkerStatus />
      {/* File picker input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,.skel,.atlas,.atlas.txt,.png,.jpg,.jpeg,.webp,.zip"
        onChange={handleFileInputChange}
        className="hidden"
      />
      {/* Small tester button in top-right */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpenTester}
        className="absolute top-4 right-4 text-xs"
        title="Open SpineBase Tester"
      >
        <TestTube className="w-3 h-3 mr-1" />
        Tester
      </Button>
      {/* ZARDOY Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-[20rem] font-bold italic text-white opacity-[0.03] select-none tracking-wider" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
          ZARDOY
        </div>
      </div>
      <Card className="max-w-2xl w-full p-12 text-center border-2 border-dashed border-border hover:border-primary/50 transition-colors relative z-10">
        <p
          className="absolute top-4 left-4 text-xs leading-snug text-muted-foreground/65 text-left select-none"
          title="Spine 4.3 only — 4.2 assets open on pixi-spine-viewer-42.vercel.app"
        >
          Supported: {SUPPORTED_SPINE_VERSIONS_TEXT}
        </p>
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
              An advanced Spine animation player tool. Open to view exported Spine animation files online
            </p>
            <p className="text-sm text-muted-foreground">
              Load <span className="text-primary font-medium">.skel</span>, <span className="text-primary font-medium">.json</span>, and <span className="text-primary font-medium">.atlas</span> files from your computer or URL. Drop a <span className="text-primary font-medium">folder</span> to browse subfolders in Spines Explorer, or drop <span className="text-primary font-medium">.zip</span> files.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-muted-foreground">
              Drag and drop files here or
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button
                onClick={handleFilesClick}
                size="lg"
                className="gap-2 font-semibold"
              >
                <FileImage className="w-5 h-5" />
                Select Files
              </Button>
              <Button
                onClick={handleOpenSyncedDirectory}
                size="lg"
                variant="outline"
                className="gap-2 font-semibold"
                title="Open directory and auto-reload when JSON changes"
              >
                <FolderSync className="w-5 h-5" />
                Synced directory
              </Button>
              <Button
                disabled
                size="lg"
                variant="outline"
                className="gap-2 font-semibold"
                title="Particle generator (coming soon)"
              >
                <SparklesIcon className="w-5 h-5" />
                Spine Particles Generator (WIP)
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
