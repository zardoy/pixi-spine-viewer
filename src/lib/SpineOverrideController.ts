import { proxy, useSnapshot } from 'valtio';

export interface AnimationOverride {
  animation?: string;
  skin?: string;
  loop?: boolean;
  loopDelay?: number;
  onFinished?: () => void;
}

export interface OverrideEntry {
  override: AnimationOverride;
  counter: number;
  timestamp: number;
  resolvePromise?: (value: boolean) => void; // Store resolve function for awaitAnimation
}

export class SpineOverrideController {
  public readonly overrides = proxy<Record<string, OverrideEntry>>({});
  private globalCounter = 0;
  private debug: boolean;
  private logMessages: string[] = [];

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  log(message: string): void {
    if (this.debug) {
      const logMessage = `[SpineOverrideController] ${message}`;
      this.logMessages.push(logMessage);
      console.log(logMessage);
    }
  }

  setOverride(overrideKey: string, override: AnimationOverride): number {
    const oldEntry = this.overrides[overrideKey];

    if (oldEntry) {
      this.log(`Cancelling old override: ${overrideKey}, counter: ${oldEntry.counter}`);
      
      // First, resolve any pending promise with false (interrupted)
      if (oldEntry.resolvePromise) {
        oldEntry.resolvePromise(false);
        this.log(`Resolved interrupted promise for ${overrideKey}, counter: ${oldEntry.counter}`);
      }
      
      // Then call old override's onFinished to signal interruption
      if (oldEntry.override.onFinished) {
        oldEntry.override.onFinished();
      }
    }

    this.globalCounter++;

    this.overrides[overrideKey] = {
      override,
      counter: this.globalCounter,
      timestamp: Date.now(),
    };

    this.log(`Set override: ${overrideKey}, counter: ${this.globalCounter}`);

    return this.globalCounter;
  }

  getOverride(overrideKey: string): OverrideEntry | undefined {
    return this.overrides[overrideKey];
  }

  hasOverride(overrideKey: string): boolean {
    return overrideKey in this.overrides;
  }

  clearOverride(overrideKey: string, counter: number): boolean {
    const entry = this.overrides[overrideKey];

    if (!entry) {
      this.log(`No override to clear: ${overrideKey}`);
      return false;
    }

    if (entry.counter !== counter) {
      this.log(`Counter mismatch for ${overrideKey}: ${counter} !== ${entry.counter}`);
      return false;
    }

    delete this.overrides[overrideKey];
    this.log(`Cleared override: ${overrideKey}`);
    return true;
  }

  getMergedProps(
    overrideKey: string,
    baseAnimation: string,
    baseSkin?: string,
    baseLoop?: boolean
  ): {
    animation: string;
    skin?: string;
    loop: boolean;
    loopDelay: number;
    resetCounter: number;
    onComplete: (animationName: string, resetCounterAtComplete: number) => void;
  } {
    const entry = this.overrides[overrideKey];

    if (!entry) {
      return {
        animation: baseAnimation,
        skin: baseSkin,
        loop: baseLoop ?? false,
        loopDelay: 0,
        resetCounter: 0,
        onComplete: () => {},
      };
    }

    const override = entry.override;
    const counter = entry.counter;

    return {
      animation: override.animation ?? baseAnimation,
      skin: override.skin ?? baseSkin,
      loop: override.loop ?? (override.animation ? false : (baseLoop ?? false)),
      loopDelay: override.loopDelay ?? 0,
      resetCounter: counter,
      onComplete: (animationName: string, resetCounterAtComplete: number) => {
        // CRITICAL: Check if this completion is for the CURRENT override
        // When anim1 completes during mix transition, resetCounterAtComplete=1 but current counter=2
        // So we ignore it correctly
        const currentEntry = this.overrides[overrideKey];
        const isCurrentOverride = currentEntry && currentEntry.counter === counter;
        
        // Only process if this completion matches the current override's counter
        if (isCurrentOverride && resetCounterAtComplete === counter) {
          this.log(`Animation complete: ${overrideKey}, animation: ${animationName}, counter: ${counter}`);

          if (override.onFinished) {
            override.onFinished();
          }

          if (!override.loop) {
            this.clearOverride(overrideKey, counter);
          }
        } else {
          this.log(`Ignoring stale completion: ${overrideKey}, animation: ${animationName}, counter: ${resetCounterAtComplete} (current: ${counter}), isCurrent: ${isCurrentOverride}`);
        }
      },
    };
  }

  /**
   * Async method that awaits animation completion and returns boolean.
   * @param overrideKey - Unique key for this override
   * @param animation - Animation name to play
   * @param options - Override options
   * @returns Promise<boolean> - true if animation finished successfully, false if interrupted by another override
   */
  async awaitAnimation(
    overrideKey: string,
    animation: string,
    options: {
      skin?: string;
      loop?: boolean;
      loopDelay?: number;
    } = {}
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const counter = this.setOverride(overrideKey, {
        animation,
        skin: options.skin,
        loop: options.loop ?? false,
        loopDelay: options.loopDelay,
        onFinished: () => {
          // Check if this override is still active (not interrupted)
          const currentEntry = this.overrides[overrideKey];
          const wasInterrupted = !currentEntry || currentEntry.counter !== counter;

          if (!wasInterrupted && !options.loop) {
            // Only clear if not looping and not interrupted
            this.clearOverride(overrideKey, counter);
          }

          // Resolve with false if interrupted, true if completed successfully
          this.log(`awaitAnimation: Resolving ${overrideKey}, counter: ${counter}, interrupted: ${wasInterrupted}`);
          resolve(!wasInterrupted);
        },
      });
      
      // Store resolve function in entry so setOverride can call it if interrupted
      const entry = this.overrides[overrideKey];
      if (entry && entry.counter === counter) {
        entry.resolvePromise = resolve;
      }
    });
  }

  clearAll(): void {
    Object.keys(this.overrides).forEach(key => {
      delete this.overrides[key];
    });
    this.globalCounter = 0;
  }

  getActiveKeys(): string[] {
    return Object.keys(this.overrides);
  }

  getDebugInfo(): Record<string, any> {
    const info: Record<string, any> = {};

    Object.entries(this.overrides).forEach(([key, entry]) => {
      info[key] = {
        animation: entry.override.animation,
        counter: entry.counter,
        age: Date.now() - entry.timestamp,
      };
    });

    return info;
  }
}

export function useOverrideController(controller: SpineOverrideController, overrideKey: string) {
  const snapshot = useSnapshot(controller['overrides']);
  return snapshot[overrideKey];
}
