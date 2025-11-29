/**
 * Offline Indicator
 * Professional offline mode indicator with sync status and controls
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff,
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  HardDrive
} from 'lucide-react';
import { offlineManager, SyncStatus } from '@/utils/offline/OfflineManager';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className = '',
  showDetails = false,
  compact = false
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(offlineManager.getSyncStatus());
  const [cacheStats, setCacheStats] = useState({
    queue: 0,
    cache: 0,
    userData: 0,
    audio: 0,
    totalSize: 0
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Update status periodically
  useEffect(() => {
    const updateStatus = async () => {
      setSyncStatus(offlineManager.getSyncStatus());
      setCacheStats(await offlineManager.getCacheStats());
      setLastUpdate(Date.now());
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Listen to offline manager events
  useEffect(() => {
    const handleNetworkChange = (data: { isOnline: boolean }) => {
      setSyncStatus(prev => ({ ...prev, isOnline: data.isOnline }));
    };

    const handleSyncStart = () => {
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));
    };

    const handleSyncComplete = (data: { syncedItems: number; timestamp: Date }) => {
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        pendingItems: prev.pendingItems - data.syncedItems,
        lastSyncTime: data.timestamp
      }));
    };

    const handleItemQueued = () => {
      setSyncStatus(prev => ({ ...prev, pendingItems: prev.pendingItems + 1 }));
    };

    offlineManager.on('network-change', handleNetworkChange);
    offlineManager.on('sync-start', handleSyncStart);
    offlineManager.on('sync-complete', handleSyncComplete);
    offlineManager.on('item-queued', handleItemQueued);

    return () => {
      offlineManager.off('network-change', handleNetworkChange);
      offlineManager.off('sync-start', handleSyncStart);
      offlineManager.off('sync-complete', handleSyncComplete);
      offlineManager.off('item-queued', handleItemQueued);
    };
  }, []);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    try {
      await offlineManager.startSync();
    } catch (error) {
      console.error('Manual sync failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Очистить весь кэш? Это действие нельзя отменить.')) {
      try {
        await offlineManager.clearCache();
        setCacheStats(await offlineManager.getCacheStats());
      } catch (error) {
        console.error('Failed to clear cache:', error);
      }
    }
  };

  const formatLastSync = (date?: Date): string => {
    if (!date) return 'Никогда';

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин назад`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;

    return date.toLocaleDateString();
  };

  const getNetworkStatusColor = () => {
    return syncStatus.isOnline ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  const getNetworkStatusIcon = () => {
    return syncStatus.isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />;
  };

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Badge
          variant="outline"
          className={`${getNetworkStatusColor()} flex items-center space-x-1`}
        >
          {getNetworkStatusIcon()}
          <span className="text-xs">
            {syncStatus.isOnline ? 'Онлайн' : 'Оффлайн'}
          </span>
        </Badge>

        {syncStatus.pendingItems > 0 && (
          <Badge variant="secondary" className="flex items-center space-x-1">
            <Database className="w-3 h-3" />
            <span className="text-xs">{syncStatus.pendingItems}</span>
          </Badge>
        )}

        {syncStatus.isSyncing && (
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        )}
      </div>
    );
  }

  return (
    <Card className={`w-full max-w-md ${className}`}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Network Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getNetworkStatusIcon()}
              <span className="font-medium">
                {syncStatus.isOnline ? 'Онлайн' : 'Оффлайн'}
              </span>
            </div>

            <Badge variant="outline" className="text-xs">
              Обновлено {new Date(lastUpdate).toLocaleTimeString()}
            </Badge>
          </div>

          {/* Sync Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center space-x-1">
                <Cloud className="w-4 h-4" />
                <span>Синхронизация</span>
              </span>

              {syncStatus.isSyncing ? (
                <div className="flex items-center space-x-1 text-blue-600">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="text-xs">Синхронизируется...</span>
                </div>
              ) : syncStatus.pendingItems > 0 ? (
                <div className="flex items-center space-x-1 text-orange-600">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs">{syncStatus.pendingItems} в очереди</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-green-600">
                  <CheckCircle className="w-3 h-3" />
                  <span className="text-xs">Синхронизировано</span>
                </div>
              )}
            </div>

            {syncStatus.lastSyncTime && (
              <p className="text-xs text-gray-600">
                Последняя синхронизация: {formatLastSync(syncStatus.lastSyncTime)}
              </p>
            )}
          </div>

          {/* Cache Statistics */}
          {showDetails && (
            <div className="space-y-2">
              <div className="flex items-center space-x-1 text-sm">
                <HardDrive className="w-4 h-4" />
                <span>Кэш ({cacheStats.totalSize} элементов)</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span>Очередь:</span>
                  <span>{cacheStats.queue}</span>
                </div>
                <div className="flex justify-between">
                  <span>Кэш API:</span>
                  <span>{cacheStats.cache}</span>
                </div>
                <div className="flex justify-between">
                  <span>Данные:</span>
                  <span>{cacheStats.userData}</span>
                </div>
                <div className="flex justify-between">
                  <span>Аудио:</span>
                  <span>{cacheStats.audio}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={!syncStatus.isOnline || syncStatus.isSyncing || isRefreshing}
              className="flex-1"
            >
              {isRefreshing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Синхронизировать
            </Button>

            {showDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCache}
                className="text-red-600 hover:text-red-700"
              >
                Очистить кэш
              </Button>
            )}
          </div>

          {/* Offline Warning */}
          {!syncStatus.isOnline && syncStatus.pendingItems > 0 && (
            <div className="flex items-center space-x-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <div className="text-xs text-yellow-800">
                <strong>{syncStatus.pendingItems} элементов</strong> будут синхронизированы при подключении к сети
              </div>
            </div>
          )}

          {/* Sync Progress */}
          {syncStatus.isSyncing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Прогресс синхронизации</span>
                <span>{Math.round(((cacheStats.queue - syncStatus.pendingItems) / cacheStats.queue) * 100)}%</span>
              </div>
              <Progress
                value={cacheStats.queue > 0 ? ((cacheStats.queue - syncStatus.pendingItems) / cacheStats.queue) * 100 : 0}
                className="h-2"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OfflineIndicator;
