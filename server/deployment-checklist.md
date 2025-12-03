# Диагностика проблемы 502 Bad Gateway

## Шаг 1: Проверка запуска сервера
```bash
cd server
node debug-start.js
node index.js
```

## Шаг 2: Проверка доступности сервера
```bash
curl -i https://teacher.windexs.ru/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Test"}'
```

## Шаг 3: Проверка логов сервера
- Убедитесь, что сервер запускается без ошибок
- Проверьте, что порт 4000 доступен
- Проверьте, что база данных sqlite доступна

## Шаг 4: Проверка прокси-сервера
Если используется nginx/apache, убедитесь в правильной конфигурации:
```
server {
    listen 443 ssl;
    server_name teacher.windexs.ru;
    
    location /api/ {
        proxy_pass https://teacher.windexs.ru/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Шаг 5: Проверка переменных окружения
Убедитесь, что на сервере установлены переменные:
```bash
echo $OPENAI_API_KEY
echo $JWT_SECRET
echo $PROXY_ENABLED
```

## Шаг 6: Проверка зависимостей
```bash
cd server
npm install
npm list --depth=0
```

## Возможные решения:

1. **Перезапуск сервера**
2. **Проверка порта** - убедитесь, что порт 4000 не занят
3. **Проверка прокси** - nginx может не правильно проксировать запросы
4. **Логи сервера** - добавьте больше логирования
5. **База данных** - убедитесь, что sqlite файл существует
