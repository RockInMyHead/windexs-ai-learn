# 🚀 Развертывание на Production (teacher.windexs.ru)

## Проблема 502 Bad Gateway
Ошибка возникает потому, что nginx не может подключиться к Node.js серверу на порту 4000.

## Решение: Полное руководство по развертыванию

### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка PM2 для управления процессами
sudo npm install -g pm2

# Установка nginx
sudo apt install nginx -y

# Установка certbot для SSL
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Настройка SSL сертификатов

```bash
# Получение SSL сертификата
sudo certbot --nginx -d teacher.windexs.ru

# Проверка автообновления
sudo certbot renew --dry-run
```

### 3. Развертывание приложения

```bash
# Клонирование репозитория
cd /var/www
sudo git clone https://github.com/RockInMyHead/windexs-ai-learn.git teacher.windexs.ru
cd teacher.windexs.ru

# Установка зависимостей
cd server
npm install --production

# Настройка переменных окружения
cp .env.example .env
nano .env
# Установите правильные значения:
# OPENAI_API_KEY=your_key_here
# PROXY_ENABLED=true
# PROXY_HOST=185.68.186.158
# PROXY_PORT=8000
# PROXY_USERNAME=7BwWCS
# PROXY_PASSWORD=BBBvb6
```

### 4. Настройка nginx

```bash
# Копирование конфигурации
sudo cp /var/www/teacher.windexs.ru/nginx.conf /etc/nginx/sites-available/teacher.windexs.ru

# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/teacher.windexs.ru /etc/nginx/sites-enabled/

# Удаление default конфигурации
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезапуск nginx
sudo systemctl restart nginx
```

### 5. Запуск приложения

```bash
# Переход в директорию сервера
cd /var/www/teacher.windexs.ru/server

# Инициализация базы данных (если нужно)
node create-test-user.js

# Запуск через PM2
pm2 start index.js --name teacher-ai

# Сохранение конфигурации PM2
pm2 save
pm2 startup

# Проверка статуса
pm2 status
pm2 logs teacher-ai
```

### 6. Проверка развертывания

```bash
# Проверка health endpoint
curl https://teacher.windexs.ru/health

# Проверка API
curl https://teacher.windexs.ru/api/health

# Проверка регистрации
curl -X POST https://teacher.windexs.ru/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Test User"}'
```

### 7. Альтернативный вариант: Docker

```bash
# Установка Docker
sudo apt install docker.io docker-compose -y
sudo systemctl start docker
sudo systemctl enable docker

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Развертывание через Docker
cd /var/www/teacher.windexs.ru
docker-compose up -d

# Проверка
docker-compose ps
docker-compose logs
```

## 🔍 Диагностика проблем

### Проверка процессов
```bash
# Проверка Node.js процесса
ps aux | grep node

# Проверка PM2
pm2 status
pm2 logs teacher-ai

# Проверка nginx
sudo systemctl status nginx
sudo nginx -t
```

### Проверка портов
```bash
# Проверка открытых портов
sudo netstat -tulpn | grep :4000
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
```

### Проверка логов
```bash
# Логи nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Логи приложения
pm2 logs teacher-ai
```

## 🛠️ Быстрое исправление

Если сервер уже запущен, но nginx возвращает 502:

```bash
# Перезапуск приложения
cd /var/www/teacher.windexs.ru/server
pm2 restart teacher-ai

# Перезапуск nginx
sudo systemctl restart nginx

# Очистка кэша
sudo systemctl reload nginx
```

## 📞 Контакты

При проблемах проверить:
1. Сервер запущен: `pm2 status`
2. Порт 4000 слушается: `netstat -tulpn | grep :4000`
3. Nginx конфигурация корректна: `sudo nginx -t`
4. Переменные окружения установлены: `cat server/.env`
