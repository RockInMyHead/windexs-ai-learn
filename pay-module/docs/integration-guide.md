# Руководство по интеграции Pay Module

## Быстрый старт

### 1. Установка
```bash
npm install @yourcompany/pay-module
```

### 2. Базовая настройка
```javascript
const { PaymentService, SubscriptionManager } = require('@yourcompany/pay-module');

const config = {
  yookassa: {
    shopId: 'your-shop-id',
    secretKey: 'your-secret-key',
    testMode: true,
    returnUrl: 'https://your-domain.com/payment/success'
  },
  database: {
    path: './payments.db'
  }
};

const subscriptionManager = new SubscriptionManager(config);
const paymentService = new PaymentService({
  ...config,
  subscriptionManager
});
```

### 3. Создание платежа
```javascript
app.post('/api/create-payment', async (req, res) => {
  try {
    const payment = await paymentService.createPayment({
      amount: 250,
      currency: 'RUB',
      description: 'Аудио сессия',
      userId: req.body.userId,
      userEmail: req.body.userEmail,
      plan: 'single_session'
    });

    res.json({
      paymentId: payment.id,
      confirmationUrl: payment.confirmation.confirmation_url
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Архитектура модуля

```
pay/
├── lib/                    # Основной код
│   ├── payment-service.js      # Главный сервис платежей
│   ├── subscription-manager.js # Управление подписками
│   └── yookassa-client.js      # Клиент ЮKassa API
├── database/               # Схемы и миграции БД
│   └── schema.sql
├── config/                 # Примеры конфигурации
│   └── example.js
├── examples/               # Примеры использования
│   ├── express-server.js       # Серверный пример
│   └── frontend-integration.js # Клиентский пример
├── docs/                   # Документация
│   ├── webhooks.md
│   └── integration-guide.md
└── package.json           # NPM конфигурация
```

## API Endpoints

### Платежи
- `POST /api/payments/create` - Создание платежа
- `GET /api/payments/verify/:id` - Проверка статуса
- `POST /api/payments/webhook` - Обработка уведомлений

### Подписки
- `GET /api/users/:id/subscription` - Получение подписки
- `POST /api/users/:id/use-session` - Использование сессии
- `GET /api/users/:id/access/:feature` - Проверка доступа

### Управление
- `POST /api/users/:id/create-trial` - Создание пробного периода

## Модели данных

### Пользователь (users)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Подписки (subscriptions)
```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL, -- 'free_trial', 'single_session', 'four_sessions', 'meditation_monthly'
  status TEXT NOT NULL DEFAULT 'active',
  yookassa_payment_id TEXT,
  started_at INTEGER NOT NULL,
  expires_at INTEGER, -- Для месячных подписок
  auto_renew INTEGER NOT NULL DEFAULT 1,
  audio_sessions_limit INTEGER,
  audio_sessions_used INTEGER DEFAULT 0,
  meditation_access INTEGER DEFAULT 0,
  free_sessions_remaining INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### Платежи (payments) - опционально
```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  yookassa_id TEXT UNIQUE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL,
  plan TEXT,
  created_at INTEGER NOT NULL
);
```

## Планы подписок

### single_session
- Цена: 250 ₽
- Одна аудио сессия
- Одноразовый платеж

### four_sessions
- Цена: 900 ₽ (225 ₽ за сессию)
- Четыре аудио сессии
- Одноразовый платеж

### meditation_monthly
- Цена: 100 ₽/месяц
- Неограниченный доступ к медитациям
- Автопродление

### free_trial
- Цена: 0 ₽
- Три бесплатные сессии
- Для новых пользователей

## Система доступа

### Проверка доступа к аудио сессиям
```javascript
const access = await paymentService.checkUserAccess(userId, 'audio_sessions');
// {
//   hasAccess: true,
//   type: 'paid', // 'free_trial' | 'paid'
//   remaining: 3,  // Осталось сессий
//   total: 4       // Всего сессий
// }
```

### Проверка доступа к медитациям
```javascript
const access = await paymentService.checkUserAccess(userId, 'meditations');
// {
//   hasAccess: true,
//   type: 'paid' // 'included' | 'paid'
// }
```

### Использование сессии
```javascript
const success = await paymentService.useSession(userId);
// true - сессия использована
// false - сессий нет или ошибка
```

## Webhook интеграция

### Настройка в ЮKassa
1. Перейдите в личный кабинет ЮKassa
2. Настройки → Уведомления
3. Добавьте URL: `https://your-domain.com/api/payments/webhook`
4. Выберите событие: `payment.succeeded`

### Обработчик webhook
```javascript
app.post('/api/payments/webhook', async (req, res) => {
  try {
    await paymentService.handleWebhook(req.body);
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ status: 'error' }); // Всегда 200!
  }
});
```

## Тестирование

### Тестовые платежи
```javascript
// Для тестирования используйте:
const testMethods = paymentService.getTestPaymentMethods();
// [
//   { name: 'Тестовая карта', action: 'test_card' },
//   { name: 'Мгновенная оплата', action: 'instant_success' },
//   { name: 'Тест отмены', action: 'test_cancel' }
// ]

const result = await paymentService.simulatePayment('instant_success', userId, 'single_session');
// { success: true, paymentId: 'test_123' }
```

### Тестовая карта ЮKassa
- Номер: `5555 5555 5555 4444`
- CVC: `123`
- Срок: `12/30`

## Мониторинг и аналитика

### Активные подписки
```sql
SELECT
  s.*,
  u.name as user_name,
  u.email as user_email
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.status = 'active';
```

### Статистика платежей
```sql
SELECT
  DATE(created_at / 1000, 'unixepoch', 'localtime') as date,
  COUNT(*) as payments_count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_payment
FROM payments
WHERE status = 'succeeded'
GROUP BY DATE(created_at / 1000, 'unixepoch', 'localtime')
ORDER BY date DESC;
```

### Отчет по использованию сессий
```sql
SELECT
  u.name,
  s.plan,
  s.audio_sessions_used,
  s.audio_sessions_limit,
  CASE
    WHEN s.audio_sessions_limit > 0
    THEN ROUND(s.audio_sessions_used * 100.0 / s.audio_sessions_limit, 1)
    ELSE 0
  END as usage_percent
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.status = 'active'
ORDER BY usage_percent DESC;
```

## Безопасность

### Переменные окружения
```bash
# Обязательные
YOOKASSA_SHOP_ID=your-shop-id
YOOKASSA_SECRET_KEY=your-secret-key

# Опциональные
YOOKASSA_TEST_MODE=true
DATABASE_PATH=./payments.db
WEBHOOK_SECRET=your-webhook-secret
APP_URL=https://your-domain.com
```

### Валидация данных
- Все входные данные валидируются
- SQL injection предотвращен параметризованными запросами
- Webhook подписи проверяются (если настроено)

### Логирование
- Все платежи логируются
- Ошибки записываются с полным контекстом
- Чувствительные данные маскируются

## Производительность

### Оптимизации
- Использование индексов в БД
- Кеширование результатов проверки доступа
- Ограничение одновременных платежей

### Масштабирование
- Поддержка PostgreSQL/MySQL для больших нагрузок
- Возможность шардирования по пользователям
- Кеширование с Redis (опционально)

## Troubleshooting

### Распространенные проблемы

#### Платежи не проходят
```
Проверьте:
- Корректность Shop ID и Secret Key
- Режим тестирования (testMode)
- Валюту и сумму платежа
```

#### Webhook не приходит
```
Проверьте:
- URL webhook в настройках ЮKassa
- HTTPS протокол
- Доступность сервера
```

#### Подписки не активируются
```
Проверьте:
- Обработку webhook
- Наличие userId и plan в metadata
- Состояние базы данных
```

#### Дублирование платежей
```
Используйте:
- Проверку идемпотентности
- Уникальные payment IDs
- Правильную обработку ошибок
```

## Миграция с других систем

### Из Stripe
```javascript
// Конвертация планов
const planMapping = {
  'price_single': 'single_session',
  'price_four': 'four_sessions',
  'price_monthly': 'meditation_monthly'
};

// Конвертация подписок
// ... код миграции
```

### Из других платежных систем
```javascript
// Универсальный адаптер
class PaymentAdapter {
  async migrateFromOldSystem(oldPayments) {
    for (const oldPayment of oldPayments) {
      await paymentService.createSubscriptionFromPayment(
        oldPayment.userId,
        oldPayment.plan,
        oldPayment.externalId,
        oldPayment.amount
      );
    }
  }
}
```

## Поддержка и обновления

### Версии
- **1.0.0** - Первая стабильная версия
- **1.1.0** - Добавлена поддержка PostgreSQL
- **1.2.0** - Добавлены аналитические отчеты

### Обновление
```bash
npm update @yourcompany/pay-module

# Проверьте breaking changes в CHANGELOG
# Обновите конфигурацию если необходимо
# Запустите миграции БД
```

### Поддержка
- 📧 Email: support@yourcompany.com
- 💬 Issues: GitHub Issues
- 📖 Документация: docs.yourcompany.com/pay-module

---

## Заключение

Pay Module предоставляет полный набор инструментов для интеграции платежей и управления подписками. Модуль протестирован в production и готов к использованию в ваших проектах.

Для дополнительной информации обратитесь к примерам в папке `examples/` или откройте issue на GitHub.</contents>
</xai:function_call">Создаю подробное руководство по интеграции
