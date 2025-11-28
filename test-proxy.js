#!/usr/bin/env node

/**
 * Скрипт для тестирования прокси подключения к OpenAI API
 */

const https = require('https');
const HttpsProxyAgent = require('https-proxy-agent');

// Настройки прокси
const PROXY_CONFIG = {
  host: '185.68.187.20',
  port: 8000,
  auth: 'rBD9e6:jZdUnJ'
};

// Создаем прокси агент
const proxyUrl = `http://${PROXY_CONFIG.auth}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
const proxyAgent = new HttpsProxyAgent(proxyUrl);

console.log('🧪 Тестирование прокси подключения...');
console.log('📡 Прокси:', proxyUrl);
console.log('🎯 Цель: OpenAI API');

// Тест 1: Проверка доступности прокси
console.log('\n1️⃣ Тест подключения к прокси...');
const testProxyReq = https.request({
  hostname: 'httpbin.org',
  path: '/ip',
  method: 'GET',
  agent: proxyAgent,
  timeout: 10000
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('✅ Прокси работает! Ваш IP:', result.origin);
    } catch (e) {
      console.log('✅ Прокси отвечает, но не JSON формат');
      console.log('📄 Ответ:', data.substring(0, 100) + '...');
    }
  });
});

testProxyReq.on('error', (err) => {
  console.log('❌ Ошибка подключения к прокси:', err.message);
});

testProxyReq.on('timeout', () => {
  console.log('⏰ Таймаут подключения к прокси');
  testProxyReq.destroy();
});

testProxyReq.end();

// Тест 2: Проверка OpenAI API через прокси (если есть API ключ)
setTimeout(() => {
  console.log('\n2️⃣ Тест OpenAI API через прокси...');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('⚠️ OPENAI_API_KEY не найден. Пропускаем тест OpenAI API.');
    console.log('💡 Установите переменную окружения: export OPENAI_API_KEY=your_key');
    return;
  }

  const openaiReq = https.request({
    hostname: 'api.openai.com',
    path: '/v1/models',
    method: 'GET',
    agent: proxyAgent,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  }, (res) => {
    console.log('📊 Статус ответа OpenAI:', res.statusCode);

    if (res.statusCode === 200) {
      console.log('✅ OpenAI API доступен через прокси!');
    } else {
      let errorData = '';
      res.on('data', (chunk) => errorData += chunk);
      res.on('end', () => {
        console.log('❌ OpenAI API вернул ошибку:');
        try {
          const error = JSON.parse(errorData);
          console.log('   Код:', error.error?.code);
          console.log('   Сообщение:', error.error?.message);
        } catch (e) {
          console.log('   Ответ:', errorData);
        }
      });
    }
  });

  openaiReq.on('error', (err) => {
    console.log('❌ Ошибка подключения к OpenAI через прокси:', err.message);
  });

  openaiReq.on('timeout', () => {
    console.log('⏰ Таймаут запроса к OpenAI');
    openaiReq.destroy();
  });

  openaiReq.end();
}, 2000);

// Инструкции
setTimeout(() => {
  console.log('\n📋 Инструкции по настройке:');
  console.log('1. Скопируйте proxy-config.env на сервер');
  console.log('2. Установите переменные окружения:');
  console.log('   export HTTPS_PROXY=http://rBD9e6:jZdUnJ@185.68.187.20:8000');
  console.log('3. Перезапустите сервер');
  console.log('4. Проверьте логи - ошибка должна исчезнуть');
}, 5000);
