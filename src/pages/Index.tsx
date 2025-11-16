import { useState } from "react";
import { LandingPage } from "@/components/LandingPage";
import { SpineViewer } from "@/components/SpineViewer";

export interface SpineFiles {
  jsonFile: File;
  atlasFile: File;
  imageFiles: File[];
}

const Index = () => {
  const [spineFiles, setSpineFiles] = useState<SpineFiles | null>(null);

  const handleFilesSelect = (files: SpineFiles) => {
    setSpineFiles(files);
  };

  const handleBack = () => {
    setSpineFiles(null);
  };

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
