/**
 * Offline Manager
 * Comprehensive offline mode management with sync capabilities
 */

import { openDB, IDBPDatabase } from 'idb';

export interface OfflineQueueItem {
  id: string;
  type: 'audio_upload' | 'chat_message' | 'progress_update' | 'file_upload';
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingItems: number;
  lastSyncTime?: Date;
  syncErrors: string[];
}

export interface CacheEntry {
  url: string;
  response: Response;
  timestamp: number;
  expiresAt?: number;
}

export class OfflineManager {
  private db: IDBPDatabase | null = null;
  private isOnline = navigator.onLine;
  private isSyncing = false;
  private syncQueue: OfflineQueueItem[] = [];
  private eventListeners: Map<string, Set<Function>> = new Map();
  private syncInProgress = new Set<string>();

  constructor() {
    this.initializeDatabase();
    this.setupNetworkListeners();
    this.setupVisibilityListeners();
  }

  /**
   * Initialize IndexedDB database
   */
  private async initializeDatabase(): Promise<void> {
    try {
      this.db = await openDB('teacher-app-offline', 3, {
        upgrade(db, oldVersion, newVersion) {
          // Queue for offline actions
          if (!db.objectStoreNames.contains('queue')) {
            const queueStore = db.createObjectStore('queue', { keyPath: 'id' });
            queueStore.createIndex('type', 'type');
            queueStore.createIndex('priority', 'priority');
            queueStore.createIndex('timestamp', 'timestamp');
          }

          // Cache for responses
          if (!db.objectStoreNames.contains('cache')) {
            const cacheStore = db.createObjectStore('cache', { keyPath: 'url' });
            cacheStore.createIndex('timestamp', 'timestamp');
            cacheStore.createIndex('expiresAt', 'expiresAt');
          }

          // User data cache
          if (!db.objectStoreNames.contains('userData')) {
            db.createObjectStore('userData', { keyPath: 'key' });
          }

          // Audio cache for voice messages
          if (!db.objectStoreNames.contains('audioCache')) {
            const audioStore = db.createObjectStore('audioCache', { keyPath: 'id' });
            audioStore.createIndex('timestamp', 'timestamp');
          }
        }
      });

      console.log('✅ Offline database initialized');
    } catch (error) {
      console.error('❌ Failed to initialize offline database:', error);
      throw error;
    }
  }

  /**
   * Setup network status listeners
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Network online');
      this.isOnline = true;
      this.emit('network-change', { isOnline: true });
      this.startSync();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Network offline');
      this.isOnline = false;
      this.emit('network-change', { isOnline: false });
    });
  }

  /**
   * Setup page visibility listeners for background sync
   */
  private setupVisibilityListeners(): void {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.startSync();
      }
    });
  }

  /**
   * Add item to offline queue
   */
  async queueForSync(
    type: OfflineQueueItem['type'],
    data: any,
    priority: OfflineQueueItem['priority'] = 'medium'
  ): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const item: OfflineQueueItem = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      priority
    };

    await this.db.add('queue', item);
    this.syncQueue.push(item);

    this.emit('item-queued', item);
    console.log(`📋 Item queued for sync: ${item.id} (${type})`);

    // Try to sync immediately if online
    if (this.isOnline) {
      this.startSync();
    }

    return item.id;
  }

  /**
   * Start background sync
   */
  async startSync(): Promise<void> {
    if (!this.isOnline || this.isSyncing || !this.db) return;

    this.isSyncing = true;
    this.emit('sync-start');

    try {
      // Load queued items from DB
      const queuedItems = await this.db.getAll('queue');
      this.syncQueue = queuedItems.sort((a, b) => {
        // Sort by priority first, then by timestamp
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      });

      console.log(`🔄 Starting sync with ${this.syncQueue.length} items`);

      // Process queue
      for (const item of this.syncQueue) {
        if (this.syncInProgress.has(item.id)) continue;

        try {
          this.syncInProgress.add(item.id);
          await this.processQueueItem(item);
          await this.db.delete('queue', item.id);
          this.syncQueue = this.syncQueue.filter(i => i.id !== item.id);
          this.emit('item-synced', item);
        } catch (error) {
          console.error(`Failed to sync item ${item.id}:`, error);
          item.retryCount++;

          if (item.retryCount >= item.maxRetries) {
            await this.db.delete('queue', item.id);
            this.syncQueue = this.syncQueue.filter(i => i.id !== item.id);
            this.emit('item-failed', { item, error });
          } else {
            await this.db.put('queue', item);
          }
        } finally {
          this.syncInProgress.delete(item.id);
        }
      }

      this.emit('sync-complete', {
        syncedItems: this.syncQueue.length,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Sync failed:', error);
      this.emit('sync-error', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Process individual queue item
   */
  private async processQueueItem(item: OfflineQueueItem): Promise<void> {
    const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

    switch (item.type) {
      case 'audio_upload':
        await this.syncAudioUpload(item, API_URL);
        break;

      case 'chat_message':
        await this.syncChatMessage(item, API_URL);
        break;

      case 'progress_update':
        await this.syncProgressUpdate(item, API_URL);
        break;

      case 'file_upload':
        await this.syncFileUpload(item, API_URL);
        break;

      default:
        throw new Error(`Unknown queue item type: ${item.type}`);
    }
  }

  /**
   * Cache API response
   */
  async cacheResponse(url: string, response: Response, maxAge?: number): Promise<void> {
    if (!this.db || !response.ok) return;

    const cacheEntry: CacheEntry = {
      url,
      response: response.clone(),
      timestamp: Date.now(),
      expiresAt: maxAge ? Date.now() + maxAge : undefined
    };

    await this.db.put('cache', cacheEntry);
    console.log(`💾 Response cached: ${url}`);
  }

  /**
   * Get cached response
   */
  async getCachedResponse(url: string): Promise<Response | null> {
    if (!this.db) return null;

    const cacheEntry = await this.db.get('cache', url);
    if (!cacheEntry) return null;

    // Check if expired
    if (cacheEntry.expiresAt && Date.now() > cacheEntry.expiresAt) {
      await this.db.delete('cache', url);
      return null;
    }

    console.log(`📖 Serving from cache: ${url}`);
    return cacheEntry.response;
  }

  /**
   * Cache user data
   */
  async cacheUserData(key: string, data: any): Promise<void> {
    if (!this.db) return;

    await this.db.put('userData', { key, data, timestamp: Date.now() });
    console.log(`👤 User data cached: ${key}`);
  }

  /**
   * Get cached user data
   */
  async getCachedUserData(key: string): Promise<any | null> {
    if (!this.db) return null;

    const entry = await this.db.get('userData', key);
    return entry ? entry.data : null;
  }

  /**
   * Cache audio data
   */
  async cacheAudioData(id: string, audioBlob: Blob, metadata?: any): Promise<void> {
    if (!this.db) return;

    await this.db.put('audioCache', {
      id,
      audioBlob,
      metadata,
      timestamp: Date.now()
    });

    console.log(`🎵 Audio cached: ${id}`);
  }

  /**
   * Get cached audio data
   */
  async getCachedAudioData(id: string): Promise<Blob | null> {
    if (!this.db) return null;

    const entry = await this.db.get('audioCache', id);
    return entry ? entry.audioBlob : null;
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingItems: this.syncQueue.length,
      lastSyncTime: this.getLastSyncTime(),
      syncErrors: [] // Could be populated from error logs
    };
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    if (!this.db) return;

    const tx = this.db.transaction(['cache', 'userData', 'audioCache'], 'readwrite');

    await Promise.all([
      tx.objectStore('cache').clear(),
      tx.objectStore('userData').clear(),
      tx.objectStore('audioCache').clear(),
      tx.done
    ]);

    console.log('🗑️ Cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    queue: number;
    cache: number;
    userData: number;
    audio: number;
    totalSize: number;
  }> {
    if (!this.db) return { queue: 0, cache: 0, userData: 0, audio: 0, totalSize: 0 };

    const [queueCount, cacheCount, userDataCount, audioCount] = await Promise.all([
      this.db.count('queue'),
      this.db.count('cache'),
      this.db.count('userData'),
      this.db.count('audioCache')
    ]);

    return {
      queue: queueCount,
      cache: cacheCount,
      userData: userDataCount,
      audio: audioCount,
      totalSize: queueCount + cacheCount + userDataCount + audioCount
    };
  }

  // Event system
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Private sync methods

  private async syncAudioUpload(item: OfflineQueueItem, apiUrl: string): Promise<void> {
    const formData = new FormData();
    formData.append('audio', item.data.audioBlob);
    formData.append('metadata', JSON.stringify(item.data.metadata));

    const response = await fetch(`${apiUrl}/audio/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error(`Audio upload failed: ${response.status}`);
    }

    console.log(`🎵 Audio uploaded: ${item.id}`);
  }

  private async syncChatMessage(item: OfflineQueueItem, apiUrl: string): Promise<void> {
    const response = await fetch(`${apiUrl}/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(item.data)
    });

    if (!response.ok) {
      throw new Error(`Chat message sync failed: ${response.status}`);
    }

    console.log(`💬 Chat message synced: ${item.id}`);
  }

  private async syncProgressUpdate(item: OfflineQueueItem, apiUrl: string): Promise<void> {
    const response = await fetch(`${apiUrl}/progress/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(item.data)
    });

    if (!response.ok) {
      throw new Error(`Progress update failed: ${response.status}`);
    }

    console.log(`📊 Progress updated: ${item.id}`);
  }

  private async syncFileUpload(item: OfflineQueueItem, apiUrl: string): Promise<void> {
    const formData = new FormData();
    formData.append('file', item.data.fileBlob);
    formData.append('metadata', JSON.stringify(item.data.metadata));

    const response = await fetch(`${apiUrl}/files/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error(`File upload failed: ${response.status}`);
    }

    console.log(`📎 File uploaded: ${item.id}`);
  }

  private getLastSyncTime(): Date | undefined {
    // This would be stored in localStorage or DB
    const stored = localStorage.getItem('lastSyncTime');
    return stored ? new Date(stored) : undefined;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.eventListeners.clear();
    this.syncQueue = [];
    this.syncInProgress.clear();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    console.log('🧹 Offline manager destroyed');
  }
}

// Singleton instance
export const offlineManager = new OfflineManager();
