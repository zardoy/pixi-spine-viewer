import { useState, useEffect } from "react";
import { LandingPage } from "../components/LandingPage";
import { SpineViewer } from "../components/SpineViewer";
import { SpinesMapViewer } from "../components/SpinesMapViewer";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { toast } from "sonner";

export interface SpineFiles {
  jsonFile: File;
  atlasFile: File;
  imageFiles: File[];
}

const Index = () => {
  const [spineFiles, setSpineFiles] = useState<SpineFiles | null>(null);
  const [spinesMapUrl, setSpinesMapUrl] = useState<string | null>(null);
  const [loadingFromUrl, setLoadingFromUrl] = useState(false);

  useEffect(() => {
    // Check for ?spinesMap=<url> parameter
    const params = new URLSearchParams(window.location.search);
    const mapUrl = params.get("spinesMap");
    if (mapUrl) {
      setSpinesMapUrl(decodeURIComponent(mapUrl));
      return;
    }

    // Check for direct spine URLs (jsonUrl, atlasUrl, pngUrl)
    const jsonUrl = params.get("jsonUrl");
    const atlasUrl = params.get("atlasUrl");
    const pngUrl = params.get("pngUrl");

    if (jsonUrl && atlasUrl && pngUrl) {
      setLoadingFromUrl(true);
      const loadSpineFromUrls = async () => {
        try {
          toast.loading("Loading spine from URL...");
          const decodedJsonUrl = decodeURIComponent(jsonUrl);
          const decodedAtlasUrl = decodeURIComponent(atlasUrl);
          const decodedPngUrl = decodeURIComponent(pngUrl);

          const files = await fetchSpineFilesFromUrl(decodedJsonUrl, decodedAtlasUrl, decodedPngUrl);

          const spineFiles: SpineFiles = {
            jsonFile: files.jsonFile,
            atlasFile: files.atlasFile,
            imageFiles: files.imageFiles,
          };

          toast.dismiss();
          toast.success("Spine loaded from URL");
          setSpineFiles(spineFiles);
        } catch (err) {
          toast.dismiss();
          const errorMessage = err instanceof Error ? err.message : "Failed to load spine from URL";
          toast.error(errorMessage);
        } finally {
          setLoadingFromUrl(false);
        }
      };
      loadSpineFromUrls();
    }
  }, []);

  const handleFilesSelect = (files: SpineFiles) => {
    setSpineFiles(files);
  };

  const handleBack = () => {
    setSpineFiles(null);
    // Restore spinesMap URL if it was there
    if (spinesMapUrl) {
      const params = new URLSearchParams();
      params.set("spinesMap", encodeURIComponent(spinesMapUrl));
      window.history.replaceState({}, "", `?${params.toString()}`);
    } else {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  // Show loading state while loading from URL
  if (loadingFromUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary">
        <div className="text-center">
          <p className="text-muted-foreground">Loading spine from URL...</p>
        </div>
      </div>
    );
  }

  // If spinesMap URL is provided, show the map viewer
  if (spinesMapUrl && !spineFiles) {
    return (
      <SpinesMapViewer
        spinesMapUrl={spinesMapUrl}
        onSpineSelect={handleFilesSelect}
      />
    );
  }

  return (
    <>
      {!spineFiles ? (
        <LandingPage onFilesSelect={handleFilesSelect} />
      ) : (
        <SpineViewer files={spineFiles} onBack={handleBack} />
      )}
    </>
  );
};

export default Index;
