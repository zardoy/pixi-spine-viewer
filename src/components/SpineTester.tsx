import { useState, useEffect, useRef } from "react";
import { Application, useExtend } from "@pixi/react";
import { Container } from "pixi.js";
import { SpineBase } from "../lib/SpineBase";
import { FileSpineLoader } from "../lib/FileSpineLoader";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SPINE_EXAMPLES } from "../lib/spineExamples";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { toast } from "sonner";
import { ArrowLeft, Play } from "lucide-react";

const SPINE_KEY = 'tester-spine';
const OWL_EXAMPLE = SPINE_EXAMPLES.find(ex => ex.name.includes('Owl'))!;

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
}

export const SpineTester = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([
    {
      name: 'Test 1: Start from 90%, unmount instantly',
      status: 'pending',
    },
    {
      name: 'Test 2: Start from 90%, reset counter, pause - verify no finished callback',
      status: 'pending',
    },
  ]);
  const [currentTest, setCurrentTest] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fileSpineLoader, setFileSpineLoader] = useState<FileSpineLoader | null>(null);
  const [isLoaderReady, setIsLoaderReady] = useState(false);
  
  // Test 1 state
  const [test1Mounted, setTest1Mounted] = useState(false);
  const [test1Progress, setTest1Progress] = useState<number | undefined>(undefined);
  const test1FinishedCalledRef = useRef(false);
  const test1MountedRef = useRef(true);
  
  // Test 2 state
  const [test2Mounted, setTest2Mounted] = useState(false);
  const [test2Progress, setTest2Progress] = useState<number | undefined>(undefined);
  const [test2ResetCounter, setTest2ResetCounter] = useState(0);
  const [test2Paused, setTest2Paused] = useState(false);
  const test2FinishedCalledRef = useRef(false);
  const test2ResetCounterAtCallbackRef = useRef<number | null>(null);

  // Load owl example
  useEffect(() => {
    const loadOwl = async () => {
      try {
        setIsLoading(true);
        toast.loading('Loading owl example...');
        const files = await fetchSpineFilesFromUrl(OWL_EXAMPLE.jsonUrl, OWL_EXAMPLE.atlasUrl);
        
        const atlasText = await files.atlasFile.text();
        const isSkelFile = files.jsonFile.name.toLowerCase().endsWith('.skel');
        const skeletonData = isSkelFile 
          ? await files.jsonFile.arrayBuffer()
          : await files.jsonFile.text();

        const loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles);
        await loader.loadSpine(SPINE_KEY);
        
        setFileSpineLoader(loader);
        setIsLoaderReady(true);
        setIsLoading(false);
        toast.dismiss();
        toast.success('Owl example loaded');
      } catch (error) {
        setIsLoading(false);
        toast.dismiss();
        toast.error('Failed to load owl example: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    };

    loadOwl();
  }, []);

  const skeletonData = fileSpineLoader?.getSkeletonData(SPINE_KEY);
  const firstAnim = skeletonData?.animations?.[0];
  const duration = firstAnim?.duration ?? 0;
  const animName = firstAnim?.name ?? '';

  // Test 1: Start animation from ~90% (5/5.2 sec) and unmount almost instantly
  const runTest1 = () => {
    if (!fileSpineLoader || !isLoaderReady || !firstAnim) return;

    setCurrentTest(0);
    setTestResults(prev => prev.map((t, i) => 
      i === 0 ? { ...t, status: 'running' } : t
    ));

    const targetTime = duration * 0.9; // 90% of duration (~5/5.2 sec)
    const animationProgress = targetTime / duration;

    test1FinishedCalledRef.current = false;
    test1MountedRef.current = true;
    setTest1Progress(animationProgress);
    setTest1Mounted(true);

    // Wait 50ms then unmount
    setTimeout(() => {
      test1MountedRef.current = false;
      setTest1Mounted(false);
      
      // Wait 200ms more to check if callback fires after unmount
      setTimeout(() => {
        const callbackFiredAfterUnmount = test1FinishedCalledRef.current && !test1MountedRef.current;
        
        setTestResults(prev => prev.map((t, i) => 
          i === 0 ? { 
            ...t, 
            status: callbackFiredAfterUnmount ? 'failed' : 'passed',
            message: callbackFiredAfterUnmount 
              ? 'Finished callback was called after unmount (should not happen)'
              : 'Component unmounted without callback firing after unmount (correct behavior)'
          } : t
        ));
        setCurrentTest(null);
        setTest1Progress(undefined);
      }, 200);
    }, 50);
  };

  // Test 2: Start from 90%, reset counter, pause - verify finished callback doesn't get called
  const runTest2 = () => {
    if (!fileSpineLoader || !isLoaderReady || !firstAnim) return;

    setCurrentTest(1);
    setTestResults(prev => prev.map((t, i) => 
      i === 1 ? { ...t, status: 'running' } : t
    ));

    const targetTime = duration * 0.9;
    const animationProgress = targetTime / duration;

    test2FinishedCalledRef.current = false;
    test2ResetCounterAtCallbackRef.current = null;
    setTest2Progress(animationProgress);
    setTest2ResetCounter(0);
    setTest2Paused(false);
    setTest2Mounted(true);

    // Start animation at 90%
    setTimeout(() => {
      // Reset counter (increment it)
      setTest2ResetCounter(1);
      
      // Pause immediately after reset
      setTimeout(() => {
        setTest2Paused(true);
        
        // Wait to see if callback fires
        setTimeout(() => {
          const callbackFired = test2FinishedCalledRef.current;
          const resetCounterAtCallback = test2ResetCounterAtCallbackRef.current;
          const currentResetCounter = 1;
          
          // Callback should not fire, or if it does, it should be from before the reset
          const shouldPass = !callbackFired || (resetCounterAtCallback !== null && resetCounterAtCallback < currentResetCounter);
          
          setTestResults(prev => prev.map((t, i) => 
            i === 1 ? { 
              ...t, 
              status: shouldPass ? 'passed' : 'failed',
              message: shouldPass
                ? 'Finished callback was not called after reset and pause (correct behavior)'
                : `Finished callback was called after reset (resetCounter: ${resetCounterAtCallback}, current: ${currentResetCounter})`
            } : t
          ));
          setCurrentTest(null);
          setTest2Mounted(false);
          setTest2Progress(undefined);
        }, 500);
      }, 100);
    }, 100);
  };

  const handleFinished1 = (animationName: string, resetCounterAtComplete: number) => {
    if (test1MountedRef.current) {
      test1FinishedCalledRef.current = true;
    }
  };

  const handleFinished2 = (animationName: string, resetCounterAtComplete: number) => {
    test2FinishedCalledRef.current = true;
    test2ResetCounterAtCallbackRef.current = resetCounterAtComplete;
  };

  const handleBack = () => {
    window.history.pushState({}, '', window.location.pathname);
    window.location.reload();
  };

  if (isLoading || !isLoaderReady || !fileSpineLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8">
          <p className="text-muted-foreground">Loading owl example...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">SpineBase Integration Tests</h1>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Test Suite</h2>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 border rounded-lg ${
                    result.status === 'passed' ? 'border-green-500 bg-green-50 dark:bg-green-950' :
                    result.status === 'failed' ? 'border-red-500 bg-red-50 dark:bg-red-950' :
                    result.status === 'running' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' :
                    'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{result.name}</div>
                      {result.message && (
                        <div className="text-sm text-muted-foreground mt-1">{result.message}</div>
                      )}
                    </div>
                    <div className="ml-4">
                      {result.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => index === 0 ? runTest1() : runTest2()}
                          disabled={currentTest !== null}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Run
                        </Button>
                      )}
                      {result.status === 'running' && (
                        <div className="text-blue-600 dark:text-blue-400">Running...</div>
                      )}
                      {result.status === 'passed' && (
                        <div className="text-green-600 dark:text-green-400 font-semibold">✓ Passed</div>
                      )}
                      {result.status === 'failed' && (
                        <div className="text-red-600 dark:text-red-400 font-semibold">✗ Failed</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Render area for tests */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Test Render Area</h2>
          <div className="w-full h-96 border rounded-lg bg-muted/50 overflow-hidden">
            {isLoaderReady && fileSpineLoader && animName && (
              <Application width={800} height={400} backgroundColor={0x1a1a1a}>
                <TesterPixiContent
                  loader={fileSpineLoader}
                  animName={animName}
                  test1Mounted={test1Mounted}
                  test1Progress={test1Progress}
                  onTest1Finished={handleFinished1}
                  test2Mounted={test2Mounted}
                  test2Progress={test2Progress}
                  test2ResetCounter={test2ResetCounter}
                  test2Paused={test2Paused}
                  onTest2Finished={handleFinished2}
                />
              </Application>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

// PIXI content component for tests
const TesterPixiContent = ({
  loader,
  animName,
  test1Mounted,
  test1Progress,
  onTest1Finished,
  test2Mounted,
  test2Progress,
  test2ResetCounter,
  test2Paused,
  onTest2Finished,
}: {
  loader: FileSpineLoader;
  animName: string;
  test1Mounted: boolean;
  test1Progress?: number;
  onTest1Finished: (resetCounter: number) => void;
  test2Mounted: boolean;
  test2Progress?: number;
  test2ResetCounter: number;
  test2Paused: boolean;
  onTest2Finished: (resetCounter: number) => void;
}) => {
  useExtend({ Container });
  
  return (
    <>
      {test1Mounted && test1Progress !== undefined && (
        <SpineBase
          spine={SPINE_KEY}
          animation={animName}
          animationProgress={test1Progress}
          paused={false}
          spineLoader={loader}
          onCurrentAnimComplete={onTest1Finished}
          x={200}
          y={200}
        />
      )}
      {test2Mounted && test2Progress !== undefined && (
        <SpineBase
          spine={SPINE_KEY}
          animation={animName}
          animationProgress={test2Progress}
          paused={test2Paused}
          resetCounter={test2ResetCounter}
          spineLoader={loader}
          onCurrentAnimComplete={onTest2Finished}
          x={600}
          y={200}
        />
      )}
    </>
  );
};
