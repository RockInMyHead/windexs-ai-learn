# 💰 Pay Module - Standalone Payment Integration

Независимый модуль оплаты с интеграцией ЮKassa для Node.js приложений. Полностью готов к внедрению в любой проект. Поддерживает подписки, разовые платежи и управление доступом к контенту.

## 🚀 Быстрый старт

### 1. Установка

```bash
# Скачайте модуль
git clone https://github.com/your-repo/pay-module.git
cd pay-module

# Установите зависимости
npm install
```

### 2. Настройка

```javascript
const { PaymentService } = require('./pay-module');

// Инициализация с вашей конфигурацией
const paymentService = new PaymentService({
  yookassa: {
    shopId: 'ваш-shop-id',        // Из личного кабинета ЮKassa
    secretKey: 'ваш-secret-key',  // Из личного кабинета ЮKassa
    testMode: true                // false для продакшена
  },
  database: {
    connectionString: 'sqlite://./payments.db'  // Путь к вашей БД
  }
});
```

### 3. Создание платежа

```javascript
// Пример создания платежа
const payment = await paymentService.createPayment({
  amount: 250,
  currency: 'RUB',
  description: 'Одна аудио сессия',
  userId: 'user123',
  userEmail: 'user@example.com',
  plan: 'single_session'
});

// Перенаправление пользователя на оплату
res.redirect(payment.confirmation.confirmation_url);
```

### 4. Проверка доступа

```javascript
// Проверка доступа к функциям
const access = await paymentService.checkUserAccess('user123', 'audio_sessions');
console.log(access);
// { hasAccess: true, remaining: 3, total: 4 }
```

## 📋 Функционал

### 💳 Виды платежей
- **Разовые платежи** - одна услуга/товар
- **Пакетные подписки** - несколько услуг по цене пакета
- **Месячные подписки** - автопродление

### 🎯 Тарифные планы
- `single_session` - 1 аудио сессия (250₽)
- `four_sessions` - 4 аудио сессии (900₽)
- `meditation_monthly` - Медитации (100₽/месяц)

### 🔐 Управление доступом
- Проверка доступа к функциям
- Счетчики использований
- Автоматическое списание сессий
- Управление сроками подписок

## 🛠️ Установка

### 1. Установка пакета
```bash
npm install @yourcompany/pay-module
```

### 2. Настройка базы данных
```sql
-- Выполните SQL из database/schema.sql
-- или используйте миграции
```

### 3. Конфигурация
```javascript
const config = {
  yookassa: {
    shopId: 'ваш-shop-id',
    secretKey: 'ваш-secret-key',
    testMode: process.env.NODE_ENV !== 'production'
  },
  database: {
    connectionString: 'sqlite://./payments.db'
  }
};
```

## 📖 API Reference

### PaymentService

#### createPayment(paymentData)
Создает платеж в ЮKassa и возвращает URL для оплаты.

```javascript
const payment = await paymentService.createPayment({
  amount: 250,
  currency: 'RUB',
  description: 'Описание платежа',
  userId: 'user123',
  userEmail: 'user@example.com',
  plan: 'single_session'
});

// Возвращает:
// {
//   id: 'payment-id',
//   status: 'pending',
//   confirmation: {
//     type: 'redirect',
//     confirmation_url: 'https://yookassa.ru/...'
//   }
// }
```

#### verifyPayment(paymentId)
Проверяет статус платежа и активирует подписку.

```javascript
const result = await paymentService.verifyPayment('payment-id');
// Возвращает: true/false
```

#### checkUserAccess(userId, feature)
Проверяет доступ пользователя к функции.

```javascript
// Проверка доступа к аудио сессиям
const access = await paymentService.checkUserAccess('user123', 'audio_sessions');
// { hasAccess: true, remaining: 3, total: 4 }

// Проверка доступа к медитациям
const meditationAccess = await paymentService.checkUserAccess('user123', 'meditations');
// { hasAccess: true, type: 'paid' }
```

### SubscriptionManager

#### createSubscription(userId, plan, paymentId)
Создает подписку для пользователя.

```javascript
const subscriptionId = await subscriptionManager.createSubscription(
  'user123',
  'four_sessions',
  'payment-id'
);
```

#### getUserSubscription(userId)
Получает активную подписку пользователя.

```javascript
const subscription = await subscriptionManager.getUserSubscription('user123');
// {
//   id: 'sub-123',
//   plan: 'four_sessions',
//   status: 'active',
//   audio_sessions_limit: 4,
//   audio_sessions_used: 1
// }
```

#### useSession(userId)
Списывает одну сессию.

```javascript
const success = await subscriptionManager.useSession('user123');
// true - сессия списана, false - сессии закончились
```

## 🗄️ База данных

Модуль использует SQLite для хранения данных о платежах и подписках.

### Основные таблицы

#### subscriptions
```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  yookassa_payment_id TEXT,
  started_at INTEGER NOT NULL,
  expires_at INTEGER,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  audio_sessions_limit INTEGER,
  audio_sessions_used INTEGER DEFAULT 0,
  meditation_access INTEGER DEFAULT 0,
  free_sessions_remaining INTEGER DEFAULT 0,
  last_audio_reset_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### payments (опционально, для логов)
```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  yookassa_id TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  plan TEXT,
  created_at INTEGER NOT NULL
);
```

## 🌐 Webhooks

### Настройка в ЮKassa
1. В личном кабинете ЮKassa перейдите в **Настройки → Уведомления**
2. Добавьте URL: `https://your-domain.com/api/payments/webhook`
3. Выберите событие: **payment.succeeded**

### Обработка webhook
```javascript
app.post('/api/payments/webhook', async (req, res) => {
  try {
    await paymentService.handleWebhook(req.body);
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## 📝 Примеры использования

### Frontend (React/Vue)
```javascript
import { PaymentService } from '@yourcompany/pay-module';

const paymentService = new PaymentService({
  yookassa: {
    shopId: process.env.REACT_APP_YOOKASSA_SHOP_ID,
    secretKey: process.env.REACT_APP_YOOKASSA_SECRET_KEY,
    testMode: process.env.NODE_ENV !== 'production'
  }
});

// Создание платежа
const handlePayment = async (plan) => {
  try {
    const payment = await paymentService.createPayment({
      amount: getPlanPrice(plan),
      currency: 'RUB',
      description: getPlanDescription(plan),
      userId: currentUser.id,
      userEmail: currentUser.email,
      plan: plan
    });

    // Перенаправление на страницу оплаты
    window.location.href = payment.confirmation.confirmation_url;
  } catch (error) {
    console.error('Payment error:', error);
  }
};
```

### Backend (Express)
```javascript
const express = require('express');
const { PaymentService } = require('@yourcompany/pay-module');

const app = express();
const paymentService = new PaymentService({
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID,
    secretKey: process.env.YOOKASSA_SECRET_KEY,
    testMode: process.env.NODE_ENV !== 'production'
  },
  database: {
    connectionString: process.env.DATABASE_URL
  }
});

// Создание платежа
app.post('/api/create-payment', async (req, res) => {
  try {
    const payment = await paymentService.createPayment(req.body);
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Проверка платежа
app.get('/api/verify-payment/:paymentId', async (req, res) => {
  try {
    const success = await paymentService.verifyPayment(req.params.paymentId);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Проверка доступа
app.get('/api/user/:userId/access/:feature', async (req, res) => {
  try {
    const access = await paymentService.checkUserAccess(
      req.params.userId,
      req.params.feature
    );
    res.json(access);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## ⚙️ Конфигурация

### Переменные окружения
```bash
# Yookassa
YOOKASSA_SHOP_ID=1183996
YOOKASSA_SECRET_KEY=your-secret-key
YOOKASSA_TEST_MODE=false

# Database
DATABASE_URL=sqlite://./payments.db

# App
APP_URL=https://your-domain.com
```

### Настройки модуля
```javascript
const config = {
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID,
    secretKey: process.env.YOOKASSA_SECRET_KEY,
    testMode: process.env.YOOKASSA_TEST_MODE === 'true',
    returnUrl: `${process.env.APP_URL}/payment/success`
  },
  database: {
    connectionString: process.env.DATABASE_URL || 'sqlite://./payments.db'
  },
  plans: {
    single_session: { price: 250, sessions: 1 },
    four_sessions: { price: 900, sessions: 4 },
    meditation_monthly: { price: 100, type: 'monthly' }
  }
};
```

## 🔧 Тестирование

### Unit тесты
```bash
npm test
```

### Integration тесты
```bash
npm run test:integration
```

### Тестовые платежи
Для тестирования используйте тестовые данные ЮKassa:
- Карта: 5555 5555 5555 4444
- CVC: 123
- Срок: 12/30

## 📊 Мониторинг

### Метрики
- Количество успешных платежей
- Конверсия платежей
- Средний чек
- Отток подписчиков

### Логи
```javascript
// Включение детального логирования
const paymentService = new PaymentService({
  ...config,
  logging: {
    level: 'debug',
    file: './logs/payments.log'
  }
});
```

## 🐛 Troubleshooting

### Проблема: Платежи не проходят
**Решение:**
1. Проверьте корректность Shop ID и Secret Key
2. Убедитесь, что webhook URL настроен правильно
3. Проверьте логи сервера

### Проблема: Подписки не активируются
**Решение:**
1. Проверьте обработку webhook
2. Убедитесь, что база данных доступна
3. Проверьте логи активации подписок

### Проблема: Доступ не проверяется
**Решение:**
1. Проверьте правильность userId
2. Убедитесь, что подписка активна
3. Проверьте логи проверки доступа

## 📄 Лицензия

MIT License - см. LICENSE файл

## 🤝 Contributing

1. Fork проект
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📞 Поддержка

- Issues: [GitHub Issues](https://github.com/yourcompany/pay-module/issues)
- Email: support@yourcompany.com
- Docs: [Полная документация](https://docs.yourcompany.com/pay-module)

---

**Версия:** 1.0.0
**Совместимость:** Node.js 16+
**База данных:** SQLite, PostgreSQL, MySQL</contents>
</xai:function_call">Создаю README.md для модуля оплаты
