# Webhook Integration Guide

## Обзор

Вебхуки позволяют автоматически обрабатывать платежи без необходимости ручной проверки. Когда пользователь оплачивает на ЮKassa, система отправляет уведомление на ваш сервер.

## Настройка в ЮKassa

### 1. Вход в личный кабинет
```
URL: https://yookassa.ru/my
```

### 2. Переход в настройки уведомлений
```
Меню: Настройки → Уведомления
Или прямая ссылка: https://yookassa.ru/my/merchant/integration/http-notifications
```

### 3. Добавление URL webhook
```bash
Production URL: https://your-domain.com/api/payments/webhook
Development URL: https://your-domain.com/api/payments/webhook
```

### 4. Выбор событий
Отметьте следующие события:
- ✅ `payment.succeeded` - платеж успешно завершен
- ✅ `payment.canceled` - платеж отменен (опционально)

### 5. Сохранение настроек

## Структура Webhook

### Пример уведомления о успешном платеже
```json
{
  "event": "payment.succeeded",
  "object": {
    "id": "2d5a1234-5678-90ab-cdef-1234567890ab",
    "status": "succeeded",
    "amount": {
      "value": "250.00",
      "currency": "RUB"
    },
    "description": "Одна аудио сессия с психологом",
    "metadata": {
      "userId": "user_123456",
      "plan": "single_session"
    },
    "paid": true,
    "payment_method": {
      "type": "bank_card",
      "id": "2d5a1234-5678-90ab-cdef-1234567890ab",
      "saved": false,
      "card": {
        "first6": "555555",
        "last4": "4444",
        "expiry_month": "12",
        "expiry_year": "2030",
        "card_type": "MasterCard"
      }
    },
    "created_at": "2024-01-15T10:30:00.000Z",
    "captured_at": "2024-01-15T10:30:45.000Z"
  }
}
```

## Обработка Webhook

### Express.js обработчик
```javascript
const express = require('express');
const { PaymentService } = require('@yourcompany/pay-module');

const app = express();
app.use(express.json());

const paymentService = new PaymentService(config);

app.post('/api/payments/webhook', async (req, res) => {
  try {
    const notification = req.body;

    console.log('Received webhook:', notification.event);

    // Обработка разных типов событий
    switch (notification.event) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(notification.object);
        break;

      case 'payment.canceled':
        await handlePaymentCanceled(notification.object);
        break;

      default:
        console.log('Unknown webhook event:', notification.event);
    }

    // ВАЖНО: Всегда возвращать 200 OK
    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook processing error:', error);

    // ВАЖНО: Даже при ошибке возвращать 200, чтобы ЮKassa не повторяла запрос
    res.status(200).json({
      status: 'error',
      message: error.message
    });
  }
});
```

### Функции обработки
```javascript
async function handlePaymentSucceeded(payment) {
  console.log('Processing successful payment:', payment.id);

  // Извлечение данных из платежа
  const { userId, plan } = payment.metadata;
  const amount = parseFloat(payment.amount.value);

  try {
    // Создание подписки
    const subscriptionId = await paymentService.createSubscriptionFromPayment(
      userId,
      plan,
      payment.id,
      amount
    );

    console.log('Subscription created:', subscriptionId);

    // Отправка уведомления пользователю (опционально)
    await sendPaymentSuccessEmail(userId, plan, amount);

  } catch (error) {
    console.error('Failed to process payment:', error);
    // Логируем ошибку, но не выбрасываем исключение
    // Webhook должен всегда возвращать успех
  }
}

async function handlePaymentCanceled(payment) {
  console.log('Processing canceled payment:', payment.id);

  // Обработка отмены платежа
  // Например, пометка платежа как отмененного
  await paymentService.markPaymentAsCanceled(payment.id);
}
```

## Проверка подлинности Webhook

### Использование IP адресов
ЮKassa отправляет вебхуки только с определенных IP адресов:

```
185.71.76.0/27
185.71.77.0/27
77.75.153.0/25
77.75.154.0/23
```

Проверьте IP адрес отправителя:
```javascript
const allowedIPs = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.154.0/23'
];

function isValidIP(ip) {
  // Реализация проверки CIDR
  return allowedIPs.some(cidr => isIPInCIDR(ip, cidr));
}

app.post('/api/payments/webhook', (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  if (!isValidIP(clientIP)) {
    console.warn('Invalid webhook IP:', clientIP);
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}, webhookHandler);
```

### Использование подписей (рекомендуется)
```javascript
// В настройках ЮKassa установите секретный ключ
const WEBHOOK_SECRET = process.env.YOOKASSA_WEBHOOK_SECRET;

function validateWebhookSignature(body, signature) {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(body, Object.keys(body).sort()))
    .digest('hex');

  return signature === expectedSignature;
}

app.post('/api/payments/webhook', (req, res) => {
  const signature = req.headers['yookassa-signature'] || req.headers['signature'];

  if (!validateWebhookSignature(req.body, signature)) {
    console.warn('Invalid webhook signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // Обработка webhook...
});
```

## Идемпотентность

### Проблема
ЮKassa может отправить один webhook несколько раз. Необходимо обрабатывать дубликаты.

### Решение
```javascript
// Храните обработанные платежи в базе данных
async function handlePaymentSucceeded(payment) {
  // Проверяем, не обрабатывали ли уже этот платеж
  const existingPayment = await db.getPaymentByYookassaId(payment.id);

  if (existingPayment) {
    console.log('Payment already processed:', payment.id);
    return;
  }

  // Обрабатываем платеж
  await processPayment(payment);

  // Сохраняем в базу
  await db.savePayment({
    yookassaId: payment.id,
    status: 'processed',
    processedAt: new Date()
  });
}
```

## Тестирование

### Ручное тестирование
```bash
# Отправка тестового webhook
curl -X POST https://your-domain.com/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.succeeded",
    "object": {
      "id": "test-payment-123",
      "status": "succeeded",
      "amount": { "value": "250.00", "currency": "RUB" },
      "metadata": { "userId": "user_test", "plan": "single_session" }
    }
  }'
```

### Автоматическое тестирование
```javascript
const request = require('supertest');
const app = require('./app');

describe('Webhook Tests', () => {
  test('should process successful payment', async () => {
    const webhookData = {
      event: 'payment.succeeded',
      object: {
        id: 'test-payment-123',
        status: 'succeeded',
        amount: { value: '250.00', currency: 'RUB' },
        metadata: { userId: 'user_test', plan: 'single_session' }
      }
    };

    const response = await request(app)
      .post('/api/payments/webhook')
      .send(webhookData)
      .expect(200);

    expect(response.body.status).toBe('ok');
  });
});
```

## Мониторинг

### Логирование
```javascript
// Подробное логирование всех webhook
app.post('/api/payments/webhook', (req, res) => {
  const webhookId = crypto.randomUUID();

  console.log(`[${webhookId}] Webhook received:`, {
    event: req.body.event,
    paymentId: req.body.object?.id,
    amount: req.body.object?.amount,
    userId: req.body.object?.metadata?.userId,
    timestamp: new Date().toISOString()
  });

  // Обработка...

  console.log(`[${webhookId}] Webhook processed successfully`);
});
```

### Метрики
```javascript
// Сбор метрик для мониторинга
const metrics = {
  webhooksReceived: 0,
  paymentsProcessed: 0,
  errors: 0
};

app.post('/api/payments/webhook', (req, res) => {
  metrics.webhooksReceived++;

  try {
    // Обработка...
    metrics.paymentsProcessed++;
  } catch (error) {
    metrics.errors++;
  }
});

// Endpoint для просмотра метрик
app.get('/metrics', (req, res) => {
  res.json(metrics);
});
```

## Troubleshooting

### Webhook не приходит
1. Проверьте URL в настройках ЮKassa
2. Убедитесь, что сервер доступен по HTTPS
3. Проверьте логи сервера на ошибки

### Подписки не создаются
1. Проверьте логи webhook обработчика
2. Убедитесь, что `metadata` содержит `userId` и `plan`
3. Проверьте подключение к базе данных

### Дублирование обработки
1. Реализуйте проверку идемпотентности
2. Логируйте все входящие webhook
3. Используйте уникальные ID платежей

## Безопасность

### HTTPS обязателен
Webhook URL должен использовать HTTPS в production.

### Валидация данных
Всегда валидируйте входящие данные:
```javascript
function validateWebhookData(data) {
  if (!data.event || !data.object) {
    throw new Error('Invalid webhook data structure');
  }

  if (!data.object.metadata?.userId) {
    throw new Error('Missing userId in payment metadata');
  }

  return true;
}
```

### Rate limiting
Ограничьте частоту обработки webhook:
```javascript
const rateLimit = require('express-rate-limit');

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many webhook requests'
});

app.post('/api/payments/webhook', webhookLimiter, handler);
```

## Резервные механизмы

### Fallback на polling
Если webhook не работает, используйте периодическую проверку:
```javascript
// Проверка неподтвержденных платежей каждые 5 минут
setInterval(async () => {
  const pendingPayments = await db.getPendingPayments();

  for (const payment of pendingPayments) {
    try {
      const status = await paymentService.checkPaymentStatus(payment.yookassaId);
      if (status === 'succeeded') {
        await processSuccessfulPayment(payment);
      }
    } catch (error) {
      console.error('Fallback payment check failed:', error);
    }
  }
}, 5 * 60 * 1000);
```

---

**Примечание:** Всегда тестируйте webhook интеграцию в тестовом режиме ЮKassa перед запуском в production.</contents>
</xai:function_call">Создаю документацию по вебхукам
