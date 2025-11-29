#!/usr/bin/env node

/**
 * Скрипт быстрой диагностики аудио/видео проблем
 */

console.log('🔍 Диагностика аудио/видео функционала\n');

// Проверки браузерного окружения
function checkBrowserCompatibility() {
  console.log('🌐 Проверка браузерной совместимости:');

  const checks = [
    {
      name: 'Speech Recognition API',
      check: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition),
      message: 'Speech Recognition API доступен'
    },
    {
      name: 'Audio Context API',
      check: () => !!(window.AudioContext || window.webkitAudioContext),
      message: 'Audio Context API доступен'
    },
    {
      name: 'WebRTC API',
      check: () => !!(window.RTCPeerConnection || window.webkitRTCPeerConnection),
      message: 'WebRTC API доступен'
    },
    {
      name: 'Media Devices API',
      check: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      message: 'Media Devices API доступен'
    },
    {
      name: 'Web Audio API',
      check: () => !!(window.AudioContext || window.webkitAudioContext),
      message: 'Web Audio API доступен'
    }
  ];

  checks.forEach(({ name, check, message }) => {
    try {
      const result = check();
      console.log(`  ${result ? '✅' : '❌'} ${name}: ${result ? message : 'НЕДОСТУПЕН'}`);
    } catch (error) {
      console.log(`  ❌ ${name}: ОШИБКА - ${error.message}`);
    }
  });
}

// Проверка производительности устройства
function checkDevicePerformance() {
  console.log('\n⚡ Проверка производительности устройства:');

  const performance = {
    cores: navigator.hardwareConcurrency || 'неизвестно',
    memory: (navigator as any).deviceMemory || 'неизвестно',
    platform: navigator.platform,
    userAgent: navigator.userAgent.substring(0, 50) + '...'
  };

  console.log(`  🖥️  CPU ядер: ${performance.cores}`);
  console.log(`  🧠 Память: ${performance.memory}GB`);
  console.log(`  💻 Платформа: ${performance.platform}`);
  console.log(`  🌐 User Agent: ${performance.userAgent}`);

  // Рекомендации
  const recommendations = [];
  if (performance.cores < 4) {
    recommendations.push('Устройство имеет низкую производительность - некоторые функции могут работать медленно');
  }
  if (performance.memory !== 'неизвестно' && performance.memory < 4) {
    recommendations.push('Недостаточно оперативной памяти - возможны проблемы с обработкой аудио');
  }

  if (recommendations.length > 0) {
    console.log('\n⚠️  Рекомендации:');
    recommendations.forEach(rec => console.log(`  • ${rec}`));
  }
}

// Проверка сетевого подключения
function checkNetworkConnectivity() {
  console.log('\n🌐 Проверка сетевого подключения:');

  if (navigator.onLine) {
    console.log('  ✅ Онлайн');
  } else {
    console.log('  ❌ Офлайн - функции требующие интернета будут недоступны');
  }

  // Проверка скорости соединения (примерная)
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (connection) {
    console.log(`  📊 Тип соединения: ${connection.effectiveType || 'неизвестно'}`);
    console.log(`  📶 Скорость: ${connection.downlink || 'неизвестно'} Mbps`);
  }
}

// Проверка разрешений
async function checkPermissions() {
  console.log('\n🔐 Проверка разрешений:');

  try {
    const microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    console.log(`  🎤 Микрофон: ${microphonePermission.state}`);

    if (microphonePermission.state === 'denied') {
      console.log('  ⚠️  Разрешение на микрофон отклонено - голосовые функции будут недоступны');
    }
  } catch (error) {
    console.log(`  🎤 Микрофон: проверка недоступна (${error.message})`);
  }

  try {
    const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
    console.log(`  📹 Камера: ${cameraPermission.state}`);

    if (cameraPermission.state === 'denied') {
      console.log('  ⚠️  Разрешение на камеру отклонено - видео функции будут недоступны');
    }
  } catch (error) {
    console.log(`  📹 Камера: проверка недоступна (${error.message})`);
  }
}

// Основная функция диагностики
async function runDiagnostics() {
  try {
    checkBrowserCompatibility();
    checkDevicePerformance();
    checkNetworkConnectivity();
    await checkPermissions();

    console.log('\n📋 Рекомендации по устранению проблем:');
    console.log('  1. Убедитесь, что используете современный браузер (Chrome 90+, Firefox 88+, Safari 14+)');
    console.log('  2. Предоставьте разрешения на микрофон и камеру при запросе');
    console.log('  3. Проверьте стабильность интернет-соединения');
    console.log('  4. Попробуйте перезагрузить страницу или браузер');
    console.log('  5. Если проблемы сохраняются, попробуйте другой браузер');

  } catch (error) {
    console.error('❌ Ошибка при выполнении диагностики:', error);
  }
}

// Запуск диагностики
if (typeof window !== 'undefined') {
  runDiagnostics();
} else {
  console.log('⚠️  Этот скрипт предназначен для запуска в браузере');
  console.log('   Откройте Developer Console (F12) и выполните:');
  console.log('');
  console.log('   // Вставьте содержимое debug-audio.js в консоль');
}
