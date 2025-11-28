# Настройка прокси для OpenAI API

## Проблема
OpenAI API блокирует запросы из определенных регионов/стран по причине географических ограничений.

Ошибка: `unsupported_country_region_territory`

## Решение: Прокси

### 1. Настройки прокси
```
IP: 185.68.187.20
Port: 8000
Username: rBD9e6
Password: jZdUnJ
```

### 2. Настройка на сервере (Node.js)

#### Вариант 1: Переменные окружения
```bash
# В файле .env на сервере
HTTPS_PROXY=http://rBD9e6:jZdUnJ@185.68.187.20:8000
HTTP_PROXY=http://rBD9e6:jZdUnJ@185.68.187.20:8000
```

#### Вариант 2: Использование https-proxy-agent
```bash
npm install https-proxy-agent
```

```javascript
// В server/index.js
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyAgent = new HttpsProxyAgent('http://rBD9e6:jZdUnJ@185.68.187.20:8000');

// Использовать в OpenAI клиенте
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  httpAgent: proxyAgent, // Для Node.js 18+
  // или
  // fetch: (url, options) => fetch(url, { ...options, agent: proxyAgent })
});
```

#### Вариант 3: Использование global-agent
```bash
npm install global-agent
```

```javascript
// В начале server/index.js
import 'global-agent/bootstrap';

process.env.GLOBAL_AGENT_HTTP_PROXY = 'http://rBD9e6:jZdUnJ@185.68.187.20:8000';
process.env.GLOBAL_AGENT_HTTPS_PROXY = 'http://rBD9e6:jZdUnJ@185.68.187.20:8000';
```

### 3. Тестирование прокси

#### Проверка подключения:
```bash
curl -x http://rBD9e6:jZdUnJ@185.68.187.20:8000 https://api.openai.com/v1/models
```

#### Проверка через Node.js:
```javascript
const HttpsProxyAgent = require('https-proxy-agent');
const fetch = require('node-fetch');

const proxyAgent = new HttpsProxyAgent('http://rBD9e6:jZdUnJ@185.68.187.20:8000');

fetch('https://api.openai.com/v1/models', {
  agent: proxyAgent,
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`
  }
}).then(res => console.log('Status:', res.status));
```

### 4. Альтернативные решения

#### Использование VPN:
- Настроить VPN на сервере в поддерживаемый регион (США, ЕС, etc.)

#### Использование другого провайдера:
- Anthropic Claude API
- Google Gemini API
- Local LLM (Ollama)

### 5. Диагностика проблем

#### Проверить регион сервера:
```bash
curl ifconfig.me
curl ipinfo.io
```

#### Проверить доступность прокси:
```bash
curl -x http://rBD9e6:jZdUnJ@185.68.187.20:8000 https://httpbin.org/ip
```

#### Проверить OpenAI API через прокси:
```bash
curl -x http://rBD9e6:jZdUnJ@185.68.187.20:8000 \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.openai.com/v1/models
```

### 6. Важные замечания

- **Безопасность:** Проверяйте надежность прокси-провайдера
- **Скорость:** Прокси может замедлить запросы
- **Стоимость:** Прокси может иметь лимиты или плату
- **Альтернативы:** Рассмотрите локальные LLM для снижения зависимости от внешних API

## Контакты
Если прокси не работает, сообщите для настройки альтернативных решений.
