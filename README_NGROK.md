# Проект запущен через ngrok HTTPS

## Доступ к приложению:
🌐 **Frontend:** https://d518e82d37a1.ngrok-free.app

## Что запущено:
✅ Vite dev server (порт 8080) с ngrok туннелем
✅ Node.js backend server (порт 4000) с CORS для ngrok
✅ Ngrok HTTPS туннель

## Для остановки:
```bash
# Остановить все процессы
pkill -f "vite"
pkill -f "node.*index.js" 
pkill -f "ngrok"

# Или перезапустить ngrok с новым URL
ngrok http 8080 --https
```

## Логи:
- Vite: https://teacher.windexs.ru
- Backend: https://teacher.windexs.ru/api
- Ngrok dashboard: http://localhost:4040
