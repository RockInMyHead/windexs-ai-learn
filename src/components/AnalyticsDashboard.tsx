/**
 * Analytics Dashboard
 * Professional analytics dashboard with A/B testing and reporting
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  Users,
  TrendingUp,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  Settings,
  Download,
  RefreshCw,
  Zap
} from 'lucide-react';
import { advancedAnalytics, AnalyticsReport, ABTest } from '@/utils/analytics/AdvancedAnalytics';

interface AnalyticsDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000
}) => {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [abTests, setAbTests] = useState<ABTest[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Generate initial report
  useEffect(() => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const newReport = advancedAnalytics.generateReport(startDate, endDate);
    setReport(newReport);
    setAbTests(Array.from(advancedAnalytics['abTests'].values()));
    setLastUpdate(new Date());
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      handleRefresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const newReport = advancedAnalytics.generateReport(startDate, endDate);
      setReport(newReport);
      setAbTests(Array.from(advancedAnalytics['abTests'].values()));
      setLastUpdate(new Date());
      setIsRefreshing(false);
    }, 1000);
  };

  const handleExportData = () => {
    const data = advancedAnalytics.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatPercentage = (value: number, total: number): string => {
    return total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
  };

  if (!report) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Загрузка аналитики...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-7xl mx-auto p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <BarChart3 className="w-8 h-8 mr-3 text-blue-600" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            От {report.period.start.toLocaleDateString()} до {report.period.end.toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="text-xs">
            Обновлено: {lastUpdate.toLocaleTimeString()}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportData}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Пользователи</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.metrics.users.total)}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <span>+{formatNumber(report.metrics.users.new)} новых</span>
              <TrendingUp className="w-3 h-3" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Сеансы</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.metrics.sessions.total)}</div>
            <div className="text-xs text-muted-foreground">
              {Math.floor(report.metrics.sessions.averageDuration / 60)} мин средняя длительность
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Конверсии</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.metrics.conversions.total)}</div>
            <div className="text-xs text-muted-foreground">
              {report.metrics.conversions.rate.toFixed(1)}% конверсия
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ошибки</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.metrics.performance.errorRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">
              {report.metrics.events.byCategory.error || 0} ошибок всего
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="funnel">Воронка</TabsTrigger>
          <TabsTrigger value="ab-tests">A/B Тесты</TabsTrigger>
          <TabsTrigger value="insights">Аналитика</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Engagement */}
            <Card>
              <CardHeader>
                <CardTitle>Вовлеченность пользователей</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Средняя длительность сессии</span>
                  <span className="font-medium">
                    {Math.floor(report.metrics.engagement.averageSessionDuration / 60)}:
                    {(report.metrics.engagement.averageSessionDuration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Страниц за сессию</span>
                  <span className="font-medium">{report.metrics.engagement.pagesPerSession.toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Коэффициент возврата</span>
                  <span className="font-medium">{(report.metrics.engagement.returnRate * 100).toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Top Events */}
            <Card>
              <CardHeader>
                <CardTitle>Популярные события</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.metrics.events.topEvents.slice(0, 5).map((event, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm truncate max-w-xs">{event.event}</span>
                      <Badge variant="secondary">{event.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Производительность</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {(report.metrics.performance.averageLoadTime / 1000).toFixed(1)}s
                  </div>
                  <div className="text-sm text-gray-600">Среднее время загрузки</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {report.metrics.performance.errorRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Уровень ошибок</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {(report.metrics.performance.crashRate * 100).toFixed(2)}%
                  </div>
                  <div className="text-sm text-gray-600">Коэффициент падений</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funnel Tab */}
        <TabsContent value="funnel" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Воронка конверсии</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {report.metrics.conversions.funnel.map((step, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{step.step}</span>
                      <div className="text-right">
                        <div className="font-medium">{step.users} пользователей</div>
                        <div className="text-sm text-gray-600">{step.conversion}% конверсия</div>
                      </div>
                    </div>
                    <Progress value={step.conversion} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Goal Conversions */}
          <Card>
            <CardHeader>
              <CardTitle>Достижение целей</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(report.metrics.conversions.byGoal).map(([goal, count]) => (
                  <div key={goal} className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{count}</div>
                    <div className="text-sm text-gray-600">{goal}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A/B Tests Tab */}
        <TabsContent value="ab-tests" className="space-y-6">
          {abTests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Zap className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">A/B тесты не найдены</h3>
                <p className="text-gray-600">Создайте свой первый A/B тест для оптимизации пользовательского опыта</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {abTests.map((test) => (
                <Card key={test.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        <Zap className="w-5 h-5 mr-2" />
                        {test.name}
                      </CardTitle>
                      <Badge
                        variant={
                          test.status === 'running' ? 'default' :
                          test.status === 'completed' ? 'secondary' :
                          'outline'
                        }
                      >
                        {test.status === 'running' ? 'Запущен' :
                         test.status === 'completed' ? 'Завершен' :
                         test.status === 'draft' ? 'Черновик' : 'Остановлен'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{test.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      {test.variants.map((variant) => (
                        <div key={variant.id} className="border rounded-lg p-3">
                          <div className="font-medium text-sm">{variant.name}</div>
                          <div className="text-xs text-gray-600">
                            {variant.trafficPercentage}% трафика
                          </div>
                          {test.results && (
                            <div className="mt-2">
                              <div className="text-xs text-gray-600">
                                Участники: {test.results.variants.find(v => v.variantId === variant.id)?.participants || 0}
                              </div>
                              <div className="text-xs text-gray-600">
                                Конверсии: {test.results.variants.find(v => v.variantId === variant.id)?.conversions || 0}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {test.results && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Победитель:</span>
                          <Badge variant="secondary">
                            {test.variants.find(v => v.id === test.results!.winner)?.name || 'Не определен'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Статистическая значимость:</span>
                          <span className="text-sm">
                            {(test.results.statisticalSignificance * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-sm font-medium">Рекомендации:</span>
                          <ul className="text-sm text-gray-600 mt-1">
                            {test.results.recommendations.map((rec, index) => (
                              <li key={index} className="flex items-start">
                                <CheckCircle className="w-3 h-3 mr-2 mt-0.5 text-green-500 flex-shrink-0" />
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2 mt-4">
                      {test.status === 'draft' && (
                        <Button size="sm" onClick={() => advancedAnalytics['startABTest'](test.id)}>
                          <Play className="w-4 h-4 mr-2" />
                          Запустить
                        </Button>
                      )}
                      {test.status === 'running' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => advancedAnalytics['endABTest'](test.id)}
                        >
                          <Pause className="w-4 h-4 mr-2" />
                          Завершить
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-6">
          {/* Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Инсайты</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.insights.map((insight, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded">
                    <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
                    <p className="text-sm text-blue-800">{insight}</p>
                  </div>
                ))}
                {report.insights.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    Инсайты будут доступны после накопления достаточного количества данных
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Рекомендации</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-green-50 rounded">
                    <Target className="w-5 h-5 text-green-600 mt-0.5" />
                    <p className="text-sm text-green-800">{recommendation}</p>
                  </div>
                ))}
                {report.recommendations.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    Рекомендации будут доступны после анализа данных
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsDashboard;
