/**
 * Text to Speech Converter для сервера
 * Конвертирует цифры, математические знаки и формулы в текст для озвучки
 */

// Числа от 0 до 19
const NUMBERS_0_19 = {
  0: 'ноль',
  1: 'один',
  2: 'два',
  3: 'три',
  4: 'четыре',
  5: 'пять',
  6: 'шесть',
  7: 'семь',
  8: 'восемь',
  9: 'девять',
  10: 'десять',
  11: 'одиннадцать',
  12: 'двенадцать',
  13: 'тринадцать',
  14: 'четырнадцать',
  15: 'пятнадцать',
  16: 'шестнадцать',
  17: 'семнадцать',
  18: 'восемнадцать',
  19: 'девятнадцать',
};

// Десятки
const TENS = {
  2: 'двадцать',
  3: 'тридцать',
  4: 'сорок',
  5: 'пятьдесят',
  6: 'шестьдесят',
  7: 'семьдесят',
  8: 'восемьдесят',
  9: 'девяносто',
};

// Сотни
const HUNDREDS = {
  1: 'сто',
  2: 'двести',
  3: 'триста',
  4: 'четыреста',
  5: 'пятьсот',
  6: 'шестьсот',
  7: 'семьсот',
  8: 'восемьсот',
  9: 'девятьсот',
};

// Математические знаки и символы
const MATH_SYMBOLS = {
  '+': ' плюс ',
  '-': ' минус ',
  '−': ' минус ',
  '–': ' минус ',
  '*': ' умножить на ',
  '×': ' умножить на ',
  '·': ' умножить на ',
  '/': ' разделить на ',
  '÷': ' разделить на ',
  '=': ' равно ',
  '≠': ' не равно ',
  '≈': ' приблизительно равно ',
  '<': ' меньше ',
  '>': ' больше ',
  '≤': ' меньше или равно ',
  '≥': ' больше или равно ',
  '±': ' плюс-минус ',
  '%': ' процентов ',
  '°': ' градусов ',
  '√': ' квадратный корень из ',
  '∛': ' кубический корень из ',
  '∞': ' бесконечность ',
  'π': ' пи ',
  'α': ' альфа ',
  'β': ' бета ',
  'γ': ' гамма ',
  'δ': ' дельта ',
  'θ': ' тета ',
  'λ': ' лямбда ',
  'μ': ' мю ',
  'σ': ' сигма ',
  'φ': ' фи ',
  'ω': ' омега ',
};

/**
 * Конвертирует число в текст (от 0 до 999999)
 */
function numberToWords(num) {
  if (num < 0) {
    return 'минус ' + numberToWords(Math.abs(num));
  }
  
  if (num === 0) return NUMBERS_0_19[0];
  
  if (num < 20) return NUMBERS_0_19[num];
  
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return ones === 0 ? TENS[tens] : `${TENS[tens]} ${NUMBERS_0_19[ones]}`;
  }
  
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    if (remainder === 0) return HUNDREDS[hundreds];
    return `${HUNDREDS[hundreds]} ${numberToWords(remainder)}`;
  }
  
  if (num < 1000000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    
    let thousandWord;
    if (thousands === 1) {
      thousandWord = 'одна тысяча';
    } else if (thousands === 2) {
      thousandWord = 'две тысячи';
    } else if (thousands >= 3 && thousands <= 4) {
      thousandWord = `${numberToWords(thousands)} тысячи`;
    } else if (thousands >= 5 && thousands <= 20) {
      thousandWord = `${numberToWords(thousands)} тысяч`;
    } else {
      const lastDigit = thousands % 10;
      const lastTwoDigits = thousands % 100;
      if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        thousandWord = `${numberToWords(thousands)} тысяч`;
      } else if (lastDigit === 1) {
        thousandWord = `${numberToWords(thousands - 1)} одна тысяча`;
      } else if (lastDigit === 2) {
        thousandWord = `${numberToWords(thousands - 2)} две тысячи`;
      } else if (lastDigit >= 3 && lastDigit <= 4) {
        thousandWord = `${numberToWords(thousands)} тысячи`;
      } else {
        thousandWord = `${numberToWords(thousands)} тысяч`;
      }
    }
    
    if (remainder === 0) return thousandWord;
    return `${thousandWord} ${numberToWords(remainder)}`;
  }
  
  // Для больших чисел просто читаем по цифрам
  return num.toString().split('').map(d => NUMBERS_0_19[parseInt(d)]).join(' ');
}

/**
 * Конвертирует дробное число в текст
 */
function decimalToWords(numStr) {
  const parts = numStr.split(/[.,]/);
  
  if (parts.length === 1) {
    return numberToWords(parseInt(parts[0]));
  }
  
  const intPart = numberToWords(parseInt(parts[0]));
  const decPart = parts[1].split('').map(d => NUMBERS_0_19[parseInt(d)]).join(' ');
  
  return `${intPart} целых ${decPart}`;
}

/**
 * Главная функция конвертации текста для TTS
 */
export function convertTextForTTS(text) {
  if (!text) return '';
  
  let result = text;
  
  // 1. Убираем LaTeX/KaTeX разметку
  result = result.replace(/\$\$(.*?)\$\$/g, ' $1 ');
  result = result.replace(/\$(.*?)\$/g, ' $1 ');
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, ' $1 разделить на $2 ');
  result = result.replace(/\\sqrt\{([^}]+)\}/g, ' квадратный корень из $1 ');
  result = result.replace(/\^(\d+)/g, (_, exp) => {
    const n = parseInt(exp);
    if (n === 2) return ' в квадрате';
    if (n === 3) return ' в кубе';
    return ` в степени ${numberToWords(n)}`;
  });
  result = result.replace(/\\[a-zA-Z]+/g, ''); // Убираем остальные LaTeX команды
  
  // 2. Заменяем математические символы
  for (const [symbol, word] of Object.entries(MATH_SYMBOLS)) {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), word);
  }
  
  // 3. Обрабатываем десятичные числа
  result = result.replace(/(\d+)[.,](\d+)/g, (match) => {
    return ` ${decimalToWords(match)} `;
  });
  
  // 4. Заменяем целые числа на слова
  result = result.replace(/\b(\d+)\b/g, (match) => {
    const num = parseInt(match);
    if (num <= 999999) {
      return ` ${numberToWords(num)} `;
    }
    // Для очень больших чисел читаем по цифрам
    return ` ${match.split('').map(d => NUMBERS_0_19[parseInt(d)]).join(' ')} `;
  });
  
  // 5. Убираем эмодзи (они не озвучиваются хорошо)
  result = result.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
  
  // 6. Убираем скобки (они не озвучиваются хорошо)
  result = result.replace(/[()[\]{}]/g, ' ');
  
  // 7. Очищаем множественные пробелы
  result = result.replace(/\s+/g, ' ').trim();
  
  // 8. Убираем специальные символы которые не озвучиваются
  result = result.replace(/[#@&*_~`|\\]/g, ' ');
  
  console.log(`[TTS-Convert] "${text.substring(0, 50)}..." → "${result.substring(0, 50)}..."`);
  
  return result;
}

export default convertTextForTTS;

