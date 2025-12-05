# 🚀 Быстрое внедрение Pay Module

## Предварительные требования

- Node.js 16+
- Аккаунт в [ЮKassa](https://yookassa.ru/)
- База данных (SQLite, PostgreSQL или MySQL)

## Шаг 1: Настройка ЮKassa

1. **Зарегистрируйтесь** в ЮKassa
2. **Создайте магазин** в личном кабинете
3. **Получите ключи:**
   - Shop ID (идентификатор магазина)
   - Secret Key (секретный ключ)

## Шаг 2: Установка модуля

```bash
# В вашем проекте
mkdir payment-module
cd payment-module

# Скопируйте файлы модуля оплаты
# (предполагается что модуль уже скопирован в pay-module/)

# Установите зависимости
npm install better-sqlite3 node-fetch
```

## Шаг 3: Настройка базы данных

```bash
# Выполните SQL схему
sqlite3 payments.db < database/schema.sql
```

Или для PostgreSQL/MySQL:
```sql
-- Выполните содержимое database/schema.sql
-- Измените CREATE TABLE на синтаксис вашей БД
```

## Шаг 4: Базовая интеграция

### Backend (Express.js)

```javascript
const express = require('express');
const { PaymentService } = require('./pay-module');

const app = express();
app.use(express.json());

// Инициализация сервиса оплаты
const paymentService = new PaymentService({
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID,
    secretKey: process.env.YOOKASSA_SECRET_KEY,
    testMode: process.env.NODE_ENV !== 'production'
  },
  database: {
    connectionString: 'sqlite://./payments.db'
  }
});

// Создание платежа
app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, currency, description, userId, userEmail, plan } = req.body;

    const payment = await paymentService.createPayment({
      amount: parseFloat(amount),
      currency: currency || 'RUB',
      description,
      userId,
      userEmail,
      plan
    });

    res.json({
      success: true,
      paymentUrl: payment.confirmation.confirmation_url,
      paymentId: payment.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook от ЮKassa
app.post('/api/payments/webhook', async (req, res) => {
  try {
    await paymentService.handleWebhook(req.body);
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

### Frontend (React/Vue)

```javascript
import { useState } from 'react';

function PaymentButton({ plan, user }) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: getPlanPrice(plan),
          description: getPlanDescription(plan),
          userId: user.id,
          userEmail: user.email,
          plan: plan
        })
      });

      const data = await response.json();
      if (data.success) {
        // Перенаправление на страницу оплаты
        window.location.href = data.paymentUrl;
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handlePayment} disabled={loading}>
      {loading ? 'Создание платежа...' : `Оплатить ${getPlanPrice(plan)}₽`}
    </button>
  );
}
```

## Шаг 5: Тестирование

### Тестовый платеж

```bash
# Запустите тестовый сервер
npm run start:example
```

Используйте тестовые данные ЮKassa:
- **Номер карты:** 5555 5555 5555 4444
- **CVC:** 123
- **Срок:** 12/30

### Проверка доступа

```javascript
// Проверьте доступ пользователя
const access = await paymentService.checkUserAccess('test-user-id', 'audio_sessions');
console.log(access); // { hasAccess: true, remaining: 3 }
```

## Шаг 6: Продакшн настройка

### Переменные окружения

Создайте `.env` файл:

```bash
YOOKASSA_SHOP_ID=ваш-shop-id
YOOKASSA_SECRET_KEY=ваш-secret-key
NODE_ENV=production
DATABASE_URL=sqlite://./payments.db
```

### Webhook настройка

1. В личном кабинете ЮKassa → Настройки → Уведомления
2. Добавьте URL: `https://your-domain.com/api/payments/webhook`
3. Выберите событие: `payment.succeeded`

## Доступные планы

| План | Цена | Описание |
|------|------|----------|
| `single_session` | 250₽ | 1 аудио сессия |
| `four_sessions` | 900₽ | 4 аудио сессии |
| `meditation_monthly` | 100₽/мес | Неограниченные медитации |

## Функции доступа

- `audio_sessions` - доступ к аудио сессиям
- `meditations` - доступ к медитациям

## Поддержка

Если возникли проблемы:
1. Проверьте логи сервера
2. Убедитесь что webhook URL доступен
3. Проверьте корректность ключей ЮKassa

📧 support@yourcompany.com
