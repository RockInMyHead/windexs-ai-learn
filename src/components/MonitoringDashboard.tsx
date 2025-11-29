/**
 * Monitoring Dashboard
 * Real-time monitoring dashboard for debugging and analytics
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  HardDrive,
  Zap,
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw
} from 'lucide-react';
import { monitoringSystem } from '@/utils/monitoring/MonitoringSystem';
import { performanceOptimizer } from '@/utils/performance/PerformanceOptimizer';
import { browserDetector } from '@/utils/browserCompatibility/browserDetector';

interface MonitoringDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 2000
}) => {
  const [stats, setStats] = useState(monitoringSystem.getStats());
  const [performanceReport, setPerformanceReport] = useState(performanceOptimizer.getPerformanceReport());
  const [browserInfo, setBrowserInfo] = useState(browserDetector.getBrowserInfo());
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setStats(monitoringSystem.getStats());
      setPerformanceReport(performanceOptimizer.getPerformanceReport());
      setLastUpdate(Date.now());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const handleRefresh = () => {
    setStats(monitoringSystem.getStats());
    setPerformanceReport(performanceOptimizer.getPerformanceReport());
    setBrowserInfo(browserDetector.getBrowserInfo());
    setLastUpdate(Date.now());
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className={`w-full max-w-7xl mx-auto p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <Activity className="w-8 h-8 mr-3 text-blue-600" />
            Monitoring Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Real-time system monitoring and analytics
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="text-xs">
            Last update: {new Date(lastUpdate).toLocaleTimeString()}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Dashboard */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.events.total}</div>
                <div className="text-xs text-muted-foreground">
                  {stats.events.byType.error || 0} errors
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performanceReport.current?.memoryUsage ?
                    `${performanceReport.current.memoryUsage.toFixed(1)}MB` :
                    'N/A'
                  }
                </div>
                <div className="text-xs text-muted-foreground">
                  {performanceReport.average.memoryUsage ?
                    `${performanceReport.average.memoryUsage.toFixed(1)}MB avg` :
                    ''
                  }
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.performance.errorRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Last hour
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.alerts.total}</div>
                <div className="text-xs text-muted-foreground">
                  {stats.alerts.bySeverity.critical || 0} critical
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Browser Info & Performance Issues */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Browser Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Browser:</span>
                  <Badge variant="outline">{browserInfo.name} {browserInfo.version}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Platform:</span>
                  <Badge variant="outline">{browserInfo.platform}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Performance Score:</span>
                  <Badge variant="outline">{browserDetector.getPerformanceScore()}/100</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">WebRTC:</span>
                  <Badge variant={browserDetector.getCapabilities().webRTC ? "default" : "destructive"}>
                    {browserDetector.getCapabilities().webRTC ? "Supported" : "Not Supported"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
                  Performance Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                {performanceReport.issues.length > 0 ? (
                  <div className="space-y-2">
                    {performanceReport.issues.map((issue, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-red-50 rounded">
                        <span className="text-sm text-red-700">{issue}</span>
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-green-500 mb-2">
                      <TrendingUp className="w-8 h-8 mx-auto" />
                    </div>
                    <p className="text-sm text-gray-600">No performance issues detected</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cpu className="w-5 h-5 mr-2" />
                  CPU & Memory
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Memory Usage</span>
                    <span>
                      {performanceReport.current?.memoryUsage ?
                        `${performanceReport.current.memoryUsage.toFixed(1)}MB` :
                        'N/A'
                      }
                    </span>
                  </div>
                  <Progress
                    value={performanceReport.current?.memoryUsage ?
                      (performanceReport.current.memoryUsage / 200) * 100 : 0
                    }
                    className="h-2"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>FPS</span>
                    <span>{performanceReport.current?.fps || 'N/A'}</span>
                  </div>
                  <Progress
                    value={performanceReport.current?.fps ?
                      (performanceReport.current.fps / 60) * 100 : 0
                    }
                    className="h-2"
                  />
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Average (last 100 measurements)</h4>
                  <div className="text-xs space-y-1">
                    <div>Memory: {performanceReport.average.memoryUsage?.toFixed(1)}MB</div>
                    <div>FPS: {performanceReport.average.fps?.toFixed(1)}</div>
                    <div>Network Latency: {performanceReport.average.networkLatency?.toFixed(0)}ms</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  Response Times
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Audio Latency</span>
                    <span>{performanceReport.current?.audioLatency?.toFixed(0)}ms</span>
                  </div>
                  <Progress
                    value={performanceReport.current?.audioLatency ?
                      Math.min((performanceReport.current.audioLatency / 200) * 100, 100) : 0
                    }
                    className="h-2"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Render Time</span>
                    <span>{performanceReport.current?.renderTime?.toFixed(0)}ms</span>
                  </div>
                  <Progress
                    value={performanceReport.current?.renderTime ?
                      Math.min((performanceReport.current.renderTime / 16) * 100, 100) : 0
                    }
                    className="h-2"
                  />
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Percentiles</h4>
                  <div className="text-xs space-y-1">
                    <div>P50: {performanceReport.average.renderTime?.toFixed(0)}ms</div>
                    <div>P95: {(performanceReport.average.renderTime || 0) * 1.5}ms</div>
                    <div>P99: {(performanceReport.average.renderTime || 0) * 2}ms</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.events.recent.map((event, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {event.type}
                        </Badge>
                        <span className="text-sm truncate max-w-xs">
                          {event.data.message || event.data.action || 'Event'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                  {stats.events.recent.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-8">No recent events</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.alerts.recent.map((alert, index) => (
                    <div key={index} className={`p-3 border rounded ${getSeverityColor(alert.severity)}`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className={`text-xs ${getSeverityColor(alert.severity)}`}>
                          {alert.severity}
                        </Badge>
                        <span className="text-xs">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{alert.message}</p>
                    </div>
                  ))}
                  {stats.alerts.recent.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-8">No active alerts</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Browser</h4>
                  <div className="text-sm space-y-1">
                    <div>Name: {browserInfo.name} {browserInfo.version}</div>
                    <div>Engine: {browserInfo.engine}</div>
                    <div>Platform: {browserInfo.platform}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Hardware</h4>
                  <div className="text-sm space-y-1">
                    <div>CPU Cores: {browserDetector.getCapabilities().hardwareConcurrency}</div>
                    <div>Memory: {browserDetector.getCapabilities().deviceMemory}GB</div>
                    <div>Performance Score: {browserDetector.getPerformanceScore()}/100</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Features</h4>
                  <div className="text-sm space-y-1">
                    <div>WebRTC: {browserDetector.getCapabilities().webRTC ? '✅' : '❌'}</div>
                    <div>Web Audio: {browserDetector.getCapabilities().webAudio ? '✅' : '❌'}</div>
                    <div>Speech Rec: {browserDetector.getCapabilities().speechRecognition ? '✅' : '❌'}</div>
                    <div>WebGL: {browserDetector.getCapabilities().webGL ? '✅' : '❌'}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats.events.byType).map(([type, count]) => (
                  <div key={type} className="text-center">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-gray-600 capitalize">{type}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MonitoringDashboard;
