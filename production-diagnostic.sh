#!/bin/bash

echo "🔍 Диагностика сервера teacher.windexs.ru"
echo "========================================"

# Проверка Node.js процесса
echo ""
echo "📊 Проверка Node.js процесса:"
if pgrep -f "node.*index.js" > /dev/null; then
    echo "✅ Node.js сервер запущен"
    ps aux | grep "node.*index.js" | grep -v grep
else
    echo "❌ Node.js сервер НЕ запущен"
fi

# Проверка порта 4000
echo ""
echo "🔌 Проверка порта 4000:"
if netstat -tulpn 2>/dev/null | grep :4000 > /dev/null; then
    echo "✅ Порт 4000 слушается"
    netstat -tulpn | grep :4000
else
    echo "❌ Порт 4000 не слушается"
fi

# Проверка nginx
echo ""
echo "🌐 Проверка nginx:"
if systemctl is-active --quiet nginx; then
    echo "✅ nginx запущен"
else
    echo "❌ nginx НЕ запущен"
fi

# Тест API
echo ""
echo "🔗 Тест API эндпоинтов:"
echo "Health check:"
curl -s -o /dev/null -w "HTTP %{http_code}: %{url_effective}\n" https://teacher.windexs.ru/health

echo "API health:"
curl -s -o /dev/null -w "HTTP %{http_code}: %{url_effective}\n" https://teacher.windexs.ru/api/health

echo "Регистрация:"
curl -s -o /dev/null -w "HTTP %{http_code}: %{url_effective}\n" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"diag@test.com","password":"test123","name":"Diagnostic"}' \
  https://teacher.windexs.ru/api/auth/register

# Проверка логов
echo ""
echo "📝 Последние ошибки в логах:"
if [ -f "/var/log/nginx/error.log" ]; then
    echo "Nginx errors (last 5 lines):"
    sudo tail -5 /var/log/nginx/error.log 2>/dev/null || echo "No access to nginx logs"
fi

echo ""
echo "💡 Рекомендации:"
echo "- Если Node.js не запущен: pm2 start /var/www/teacher.windexs.ru/server/index.js --name teacher-ai"
echo "- Если порт 4000 не слушается: проверить логи PM2 (pm2 logs teacher-ai)"
echo "- Если nginx не запущен: sudo systemctl start nginx"
echo "- После изменений: sudo nginx -t && sudo systemctl reload nginx"
