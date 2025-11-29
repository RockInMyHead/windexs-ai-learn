/**
 * Lazy Loader
 * Intelligent lazy loading system for components and resources
 */

export interface LazyLoadConfig {
  rootMargin?: string;
  threshold?: number;
  timeout?: number;
  retryAttempts?: number;
}

export interface LazyLoadable {
  load: () => Promise<void>;
  unload?: () => void;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies?: string[];
}

export class LazyLoader {
  private observer: IntersectionObserver | null = null;
  private loadedModules: Set<string> = new Map<string, any>();
  private loadingPromises: Map<string, Promise<any>> = new Map();
  private config: Required<LazyLoadConfig>;
  private loadQueue: Array<{ id: string; loader: LazyLoadable; element?: Element }> = [];

  constructor(config: LazyLoadConfig = {}) {
    this.config = {
      rootMargin: '50px',
      threshold: 0.1,
      timeout: 10000,
      retryAttempts: 3,
      ...config
    };

    this.initializeObserver();
  }

  /**
   * Initialize Intersection Observer
   */
  private initializeObserver(): void {
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported, falling back to immediate loading');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            const moduleId = element.dataset.lazyModule;

            if (moduleId) {
              this.loadModule(moduleId);
              this.observer?.unobserve(element);
            }
          }
        });
      },
      {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold
      }
    );
  }

  /**
   * Register a lazy-loadable module
   */
  registerModule(id: string, loader: LazyLoadable): void {
    // Add to queue based on priority
    const queueItem = { id, loader };
    this.loadQueue.push(queueItem);

    // Sort by priority (critical first)
    this.loadQueue.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.loader.priority] - priorityOrder[a.loader.priority];
    });
  }

  /**
   * Register lazy loading for an element
   */
  observeElement(element: Element, moduleId: string): void {
    if (this.observer) {
      (element as HTMLElement).dataset.lazyModule = moduleId;
      this.observer.observe(element);
    } else {
      // Fallback: load immediately
      this.loadModule(moduleId);
    }
  }

  /**
   * Load a module
   */
  async loadModule(id: string): Promise<any> {
    // Check if already loaded
    if (this.loadedModules.has(id)) {
      return this.loadedModules.get(id);
    }

    // Check if currently loading
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id);
    }

    // Find loader
    const queueItem = this.loadQueue.find(item => item.id === id);
    if (!queueItem) {
      throw new Error(`Module ${id} not registered for lazy loading`);
    }

    // Create loading promise
    const loadPromise = this.performLoad(id, queueItem.loader);
    this.loadingPromises.set(id, loadPromise);

    try {
      const result = await loadPromise;
      this.loadedModules.set(id, result);
      this.loadingPromises.delete(id);
      return result;
    } catch (error) {
      this.loadingPromises.delete(id);
      throw error;
    }
  }

  /**
   * Perform the actual loading with retry logic
   */
  private async performLoad(id: string, loader: LazyLoadable): Promise<any> {
    // Load dependencies first
    if (loader.dependencies) {
      await Promise.all(
        loader.dependencies.map(depId => this.loadModule(depId))
      );
    }

    // Load with timeout and retry
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Load timeout')), this.config.timeout);
        });

        const result = await Promise.race([
          loader.load(),
          timeoutPromise
        ]);

        console.log(`✅ Lazy loaded module: ${id} (attempt ${attempt})`);
        return result;

      } catch (error) {
        console.warn(`⚠️ Failed to load module ${id} (attempt ${attempt}/${this.config.retryAttempts}):`, error);

        if (attempt === this.config.retryAttempts) {
          throw new Error(`Failed to load module ${id} after ${this.config.retryAttempts} attempts`);
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  /**
   * Preload critical modules
   */
  async preloadCritical(): Promise<void> {
    const criticalModules = this.loadQueue
      .filter(item => item.loader.priority === 'critical')
      .map(item => item.id);

    console.log('🚀 Preloading critical modules:', criticalModules);

    await Promise.all(
      criticalModules.map(id => this.loadModule(id))
    );
  }

  /**
   * Preload high priority modules
   */
  async preloadHighPriority(): Promise<void> {
    const highPriorityModules = this.loadQueue
      .filter(item => item.loader.priority === 'high')
      .map(item => item.id);

    console.log('⚡ Preloading high priority modules:', highPriorityModules);

    // Load sequentially to avoid overwhelming the network
    for (const id of highPriorityModules) {
      await this.loadModule(id);
    }
  }

  /**
   * Unload a module
   */
  unloadModule(id: string): void {
    const module = this.loadedModules.get(id);
    if (module && typeof module.unload === 'function') {
      try {
        module.unload();
      } catch (error) {
        console.warn(`Error unloading module ${id}:`, error);
      }
    }

    this.loadedModules.delete(id);
    console.log(`🗑️ Unloaded module: ${id}`);
  }

  /**
   * Get loading statistics
   */
  getStats(): {
    loaded: number;
    loading: number;
    queued: number;
    totalSize: number;
  } {
    return {
      loaded: this.loadedModules.size,
      loading: this.loadingPromises.size,
      queued: this.loadQueue.length,
      totalSize: this.loadedModules.size + this.loadingPromises.size + this.loadQueue.length
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Unload all modules
    for (const id of this.loadedModules.keys()) {
      this.unloadModule(id);
    }

    this.loadedModules.clear();
    this.loadingPromises.clear();
    this.loadQueue = [];

    console.log('🧹 Lazy loader destroyed');
  }
}

// Predefined lazy loaders for common components
export const createComponentLoader = (
  componentName: string,
  importFn: () => Promise<any>,
  priority: LazyLoadable['priority'] = 'medium',
  dependencies?: string[]
): LazyLoadable => ({
  load: async () => {
    console.log(`📦 Loading component: ${componentName}`);
    const module = await importFn();

    // Initialize component if it has init method
    if (module.default && typeof module.default.init === 'function') {
      await module.default.init();
    }

    return module;
  },
  unload: () => {
    console.log(`📦 Unloading component: ${componentName}`);
    // Cleanup logic here
  },
  priority,
  dependencies
});

export const createResourceLoader = (
  resourceName: string,
  urls: string[],
  priority: LazyLoadable['priority'] = 'low'
): LazyLoadable => ({
  load: async () => {
    console.log(`📦 Loading resources: ${resourceName}`);

    const loadPromises = urls.map(url => {
      return new Promise((resolve, reject) => {
        let element: HTMLElement;

        if (url.endsWith('.js')) {
          element = document.createElement('script');
          (element as HTMLScriptElement).src = url;
        } else if (url.endsWith('.css')) {
          element = document.createElement('link');
          (element as HTMLLinkElement).rel = 'stylesheet';
          (element as HTMLLinkElement).href = url;
        } else {
          // Generic resource (preload)
          element = document.createElement('link');
          (element as HTMLLinkElement).rel = 'preload';
          (element as HTMLLinkElement).href = url;
          (element as HTMLLinkElement).as = url.includes('font') ? 'font' :
                                          url.includes('audio') ? 'audio' :
                                          url.includes('video') ? 'video' : 'fetch';
        }

        element.onload = () => resolve(url);
        element.onerror = () => reject(new Error(`Failed to load ${url}`));

        document.head.appendChild(element);
      });
    });

    await Promise.all(loadPromises);
    return urls;
  },
  priority
});

// Singleton instance
export const lazyLoader = new LazyLoader();

// Utility functions for common use cases
export function lazyLoadComponent(
  componentName: string,
  importFn: () => Promise<any>,
  priority: LazyLoadable['priority'] = 'medium'
): void {
  const loader = createComponentLoader(componentName, importFn, priority);
  lazyLoader.registerModule(componentName, loader);
}

export function lazyLoadResource(
  resourceName: string,
  urls: string[],
  priority: LazyLoadable['priority'] = 'low'
): void {
  const loader = createResourceLoader(resourceName, urls, priority);
  lazyLoader.registerModule(resourceName, loader);
}

export function lazyLoadOnVisible(
  element: Element,
  moduleId: string
): void {
  lazyLoader.observeElement(element, moduleId);
}
