import { useState, useEffect } from "react";
import { useSnapshot } from "valtio";
import { LandingPage } from "../components/LandingPage";
import { SpineViewer } from "../components/SpineViewer";
import { SpinesMapViewer } from "../components/SpinesMapViewer";
import { SpineTester } from "../components/SpineTester";
import { Playground } from "../components/Playground";
import { OverridePlayground } from "../components/OverridePlayground";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { toast } from "sonner";
import { spineViewerStore } from "../store/spineViewerStore";
import { SkeletonSelectModal } from "../components/SkeletonSelectModal";

export interface SpineFiles {
  jsonFile: File;
  atlasFile: File;
  imageFiles: File[];
  /** When multiple .skel/.json files share an atlas, list all for skeleton dropdown */
  skeletonFiles?: File[];
}

/** Blank spine files used when opening particle generator; shared for QS restore. */
export function getBlankParticleFiles(): SpineFiles {
  const blankJson = JSON.stringify({
    skeleton: { hash: 'particles', spine: '4.2', x: 0, y: 0, width: 12000, height: 12000, images: './' },
    bones: [{ name: 'root' }],
    slots: [],
    skins: [{ name: 'default', attachments: {} }],
    animations: {},
  });
  return {
    jsonFile: new File([blankJson], 'particles.json', { type: 'application/json' }),
    atlasFile: new File([''], 'particles.atlas', { type: 'text/plain' }),
    imageFiles: [],
  };
}

export interface PendingSkeletonSelection {
  skeletonFiles: File[];
  atlasFile: File;
  imageFiles: File[];
}

const Index = () => {
  const [spineFiles, setSpineFiles] = useState<SpineFiles | null>(null);
  const [spinesMapUrl, setSpinesMapUrl] = useState<string | null>(null);
  const [loadingFromUrl, setLoadingFromUrl] = useState(false);
  const [pendingSkeletonSelection, setPendingSkeletonSelection] = useState<PendingSkeletonSelection | null>(null);
  /** Must run before any early return (same order every render). */
  const storeSnapshot = useSnapshot(spineViewerStore);

  const loadFromUrl = () => {
    const params = new URLSearchParams(window.location.search);

    // Check for tester, playground, or override playground first
    const tester = params.get("tester");
    const playground = params.get("playground");
    const overridePlayground = params.get("overridePlayground");
    if (tester !== null || playground !== null || overridePlayground !== null) {
      // These are handled by the component render logic below
      return;
    }

    const mapUrl = params.get("spinesMap");
    if (mapUrl) {
      setSpinesMapUrl(decodeURIComponent(mapUrl));
      setSpineFiles(null); // Clear spine files when showing map
      return;
    }

    // Check for direct spine URLs (jsonUrl, atlasUrl, pngUrl, pngUrl2, pngUrl3, etc.)
    const jsonUrl = params.get("jsonUrl");
    const atlasUrl = params.get("atlasUrl");
    const pngUrl = params.get("pngUrl");
    
    // Collect all PNG URLs (pngUrl, pngUrl2, pngUrl3, etc.)
    const pngUrlMap = new Map<number, string>();
    if (pngUrl) {
      pngUrlMap.set(1, pngUrl); // pngUrl is the first one
    }
    // Check for pngUrl2, pngUrl3, etc.
    for (const [key, value] of params.entries()) {
      if (key.startsWith('pngUrl') && key !== 'pngUrl' && value) {
        const numStr = key.replace('pngUrl', '');
        const index = numStr ? parseInt(numStr) : 1;
        if (index > 0) {
          pngUrlMap.set(index, value);
        }
      }
    }
    // Sort by index and decode
    const decodedPngUrls = Array.from(pngUrlMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, url]) => decodeURIComponent(url));

    const generator = params.get("generator");
    if (generator === "1") {
      setSpineFiles(getBlankParticleFiles());
      setSpinesMapUrl(null);
      spineViewerStore.ui.particleGeneratorPanelVisible = true;
      return;
    }

    if (jsonUrl && atlasUrl && decodedPngUrls.length > 0) {
      setLoadingFromUrl(true);
      const loadSpineFromUrls = async () => {
        try {
          toast.loading("Loading spine from URL...");
          const decodedJsonUrl = decodeURIComponent(jsonUrl);
          const decodedAtlasUrl = decodeURIComponent(atlasUrl);

          const files = await fetchSpineFilesFromUrl(decodedJsonUrl, decodedAtlasUrl, decodedPngUrls);

          const spineFiles: SpineFiles = {
            jsonFile: files.jsonFile,
            atlasFile: files.atlasFile,
            imageFiles: files.imageFiles,
          };

          toast.dismiss();
          toast.success("Spine loaded from URL");
          spineViewerStore.ui.particleGeneratorPanelVisible = false;
          setSpineFiles(spineFiles);
          setSpinesMapUrl(null); // Clear map URL when showing spine
        } catch (err) {
          toast.dismiss();
          const errorMessage = err instanceof Error ? err.message : "Failed to load spine from URL";
          toast.error(errorMessage);
        } finally {
          setLoadingFromUrl(false);
        }
      };
      loadSpineFromUrls();
    } else {
      // No params, show landing page
      setSpinesMapUrl(null);
      setSpineFiles(null);
    }
  };

  useEffect(() => {
    // Initial load
    loadFromUrl();

    // Handle browser back/forward navigation
    const handlePopState = () => {
      loadFromUrl();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleFilesSelect = (files: SpineFiles) => {
    setSpineFiles(files);
  };

  const handleSkeletonSelect = (files: SpineFiles) => {
    spineViewerStore.syncedDir = null;
    spineViewerStore.refs.syncedDirHandles = null;
    spineViewerStore.ui.particleGeneratorPanelVisible = false;
    setSpineFiles(files);
    setPendingSkeletonSelection(null);
  };

  const handleBack = async () => {
    window.location.search = '';
    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })
    window.location.reload();
    setSpineFiles(null);
    spineViewerStore.ui.particleGeneratorPanelVisible = false;
    // Restore spinesMap URL if it was there (pushState for browser back/forward)
    if (spinesMapUrl) {
      const params = new URLSearchParams();
      params.set("spinesMap", encodeURIComponent(spinesMapUrl));
      window.history.pushState({}, "", `?${params.toString()}`);
    } else {
      window.history.pushState({}, "", window.location.pathname);
    }
  };

  // Check URL params for tester, playground, or override playground
  const params = new URLSearchParams(window.location.search);
  const tester = params.get("tester");
  const playground = params.get("playground");
  const overridePlayground = params.get("overridePlayground");

  if (tester !== null) {
    return <SpineTester />;
  }

  if (playground !== null) {
    return <Playground />;
  }

  if (overridePlayground !== null) {
    return <OverridePlayground />;
  }

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

  const storePending = storeSnapshot.pendingSkeletonSelection as
    | { current?: PendingSkeletonSelection }
    | null
    | undefined;
  const storePendingRaw = storePending?.current ?? (storePending as PendingSkeletonSelection | null);

  const modalPending = pendingSkeletonSelection ?? storePendingRaw;
  const isFirstSpine = !!pendingSkeletonSelection;

  return (
    <>
      {!spineFiles ? (
        <LandingPage
          onFilesSelect={handleFilesSelect}
          onMultipleSkeletonsFound={setPendingSkeletonSelection}
        />
      ) : (
        <SpineViewer files={spineFiles} onBack={handleBack} />
      )}
      {modalPending && (
        <SkeletonSelectModal
          pending={modalPending}
          onSelect={
            isFirstSpine
              ? handleSkeletonSelect
              : (files) => {
                  const cb = spineViewerStore.skeletonSelectOnSelect as { current?: (f: SpineFiles) => void } | null;
                  cb?.current?.(files);
                  spineViewerStore.pendingSkeletonSelection = null;
                  spineViewerStore.ui.skeletonSelectModalOpen = false;
                  spineViewerStore.skeletonSelectOnSelect = null;
                }
          }
          onClose={() => {
            if (isFirstSpine) {
              setPendingSkeletonSelection(null);
            } else {
              spineViewerStore.pendingSkeletonSelection = null;
              spineViewerStore.ui.skeletonSelectModalOpen = false;
              spineViewerStore.skeletonSelectOnSelect = null;
            }
          }}
        />
      )}
    </>
  );
};

export default Index;
