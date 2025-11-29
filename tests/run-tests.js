#!/usr/bin/env node

/**
 * Скрипт для запуска тестов стабильности аудио/видео функционала
 */

const { exec } = require('child_process');
const path = require('path');

console.log('🎯 Запуск тестов стабильности аудио/видео функционала\n');

// Список тестов для запуска
const testFiles = [
  'audio-stability-tests.js',
  'integration-tests.js',
  'phase1-integration-tests.js',
  'phase2-integration-tests.js'
];

let passedTests = 0;
let failedTests = 0;

function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, testFile);
    console.log(`📋 Запуск ${testFile}...`);

    const child = exec(`node ${testPath}`, (error, stdout, stderr) => {
      if (error) {
        console.log(`❌ ${testFile} - FAILED`);
        console.log(`   Ошибка: ${error.message}`);
        failedTests++;
      } else {
        console.log(`✅ ${testFile} - PASSED`);
        passedTests++;
      }

      if (stdout) {
        console.log(`   Вывод: ${stdout.trim()}`);
      }

      if (stderr) {
        console.log(`   Ошибки: ${stderr.trim()}`);
      }

      resolve();
    });
  });
}

async function runAllTests() {
  for (const testFile of testFiles) {
    await runTest(testFile);
    console.log(''); // Пустая строка между тестами
  }

  // Итоговый отчет
  console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ:');
  console.log(`✅ Пройдено: ${passedTests}`);
  console.log(`❌ Провалено: ${failedTests}`);
  console.log(`📈 Всего: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log('\n🎉 Все тесты пройдены!');
  } else {
    console.log('\n⚠️  Некоторые тесты провалены. Проверьте логи выше.');
  }
}

// Запуск тестов
runAllTests().catch(error => {
  console.error('💥 Критическая ошибка при запуске тестов:', error);
  process.exit(1);
});
