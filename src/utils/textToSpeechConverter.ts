/**
 * Text to Speech Converter
 * Конвертирует цифры, математические знаки и формулы в текст для озвучки
 * 
 * Примеры:
 * "2 + 2 = 4" → "два плюс два равно четыре"
 * "x² + y² = z²" → "икс в квадрате плюс игрек в квадрате равно зет в квадрате"
 * "√16 = 4" → "квадратный корень из шестнадцати равно четыре"
 */

// Числа от 0 до 19
const NUMBERS_0_19: Record<number, string> = {
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
const TENS: Record<number, string> = {
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
const HUNDREDS: Record<number, string> = {
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
const MATH_SYMBOLS: Record<string, string> = {
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
  'Δ': ' дельта ',
  'Σ': ' сумма ',
  '∫': ' интеграл ',
  '∂': ' частная производная ',
  '∈': ' принадлежит ',
  '∉': ' не принадлежит ',
  '⊂': ' подмножество ',
  '⊃': ' надмножество ',
  '∪': ' объединение ',
  '∩': ' пересечение ',
  '∅': ' пустое множество ',
  '⇒': ' следовательно ',
  '⇔': ' эквивалентно ',
  '∀': ' для всех ',
  '∃': ' существует ',
  '¬': ' не ',
  '∧': ' и ',
  '∨': ' или ',
};

// Степени и индексы
const SUPERSCRIPTS: Record<string, string> = {
  '⁰': ' в нулевой степени',
  '¹': ' в первой степени',
  '²': ' в квадрате',
  '³': ' в кубе',
  '⁴': ' в четвёртой степени',
  '⁵': ' в пятой степени',
  '⁶': ' в шестой степени',
  '⁷': ' в седьмой степени',
  '⁸': ' в восьмой степени',
  '⁹': ' в девятой степени',
  'ⁿ': ' в степени эн',
};

// Переменные
const VARIABLES: Record<string, string> = {
  'x': 'икс',
  'y': 'игрек',
  'z': 'зет',
  'a': 'а',
  'b': 'бэ',
  'c': 'цэ',
  'd': 'дэ',
  'n': 'эн',
  'm': 'эм',
  'k': 'ка',
  'p': 'пэ',
  'q': 'ку',
  'r': 'эр',
  's': 'эс',
  't': 'тэ',
  'f': 'эф',
  'g': 'же',
  'h': 'аш',
};

/**
 * Конвертирует число в текст (от 0 до 999999)
 */
function numberToWords(num: number): string {
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
    
    let thousandWord: string;
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
function decimalToWords(numStr: string): string {
  const parts = numStr.split(/[.,]/);
  
  if (parts.length === 1) {
    return numberToWords(parseInt(parts[0]));
  }
  
  const intPart = numberToWords(parseInt(parts[0]));
  const decPart = parts[1].split('').map(d => NUMBERS_0_19[parseInt(d)]).join(' ');
  
  return `${intPart} целых ${decPart}`;
}

/**
 * Конвертирует дробь a/b в текст
 */
function fractionToWords(numerator: string, denominator: string): string {
  const num = parseInt(numerator);
  const den = parseInt(denominator);
  
  // Специальные случаи
  if (den === 2) {
    if (num === 1) return 'одна вторая';
    return `${numberToWords(num)} вторых`;
  }
  if (den === 3) {
    if (num === 1) return 'одна третья';
    if (num === 2) return 'две третьих';
    return `${numberToWords(num)} третьих`;
  }
  if (den === 4) {
    if (num === 1) return 'одна четвёртая';
    if (num === 3) return 'три четвёртых';
    return `${numberToWords(num)} четвёртых`;
  }
  
  return `${numberToWords(num)} ${denominator === '5' ? 'пятых' : 'разделить на ' + numberToWords(den)}`;
}

/**
 * Главная функция конвертации текста для TTS
 */
export function convertTextForTTS(text: string): string {
  if (!text) return '';
  
  let result = text;
  
  // 1. Убираем LaTeX/KaTeX разметку
  result = result.replace(/\$\$(.*?)\$\$/g, ' $1 ');
  result = result.replace(/\$(.*?)\$/g, ' $1 ');
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_, num, den) => {
    return ` ${num} разделить на ${den} `;
  });
  result = result.replace(/\\sqrt\{([^}]+)\}/g, ' квадратный корень из $1 ');
  result = result.replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, (_, n, val) => {
    return ` корень ${numberToWords(parseInt(n))} степени из ${val} `;
  });
  result = result.replace(/\^(\d+)/g, (_, exp) => {
    const n = parseInt(exp);
    if (n === 2) return ' в квадрате';
    if (n === 3) return ' в кубе';
    return ` в степени ${numberToWords(n)}`;
  });
  result = result.replace(/\^\{([^}]+)\}/g, ' в степени $1 ');
  result = result.replace(/_(\d+)/g, ' индекс $1 ');
  result = result.replace(/_\{([^}]+)\}/g, ' индекс $1 ');
  result = result.replace(/\\[a-zA-Z]+/g, ''); // Убираем остальные LaTeX команды
  
  // 2. Заменяем степени Unicode
  for (const [symbol, word] of Object.entries(SUPERSCRIPTS)) {
    result = result.replace(new RegExp(symbol, 'g'), word);
  }
  
  // 3. Заменяем математические символы
  for (const [symbol, word] of Object.entries(MATH_SYMBOLS)) {
    result = result.replace(new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), word);
  }
  
  // 4. Обрабатываем дроби вида a/b
  result = result.replace(/(\d+)\s*\/\s*(\d+)/g, (_, num, den) => {
    return ` ${fractionToWords(num, den)} `;
  });
  
  // 5. Обрабатываем десятичные числа
  result = result.replace(/(\d+)[.,](\d+)/g, (match) => {
    return ` ${decimalToWords(match)} `;
  });
  
  // 6. Заменяем целые числа на слова
  result = result.replace(/\b(\d+)\b/g, (match) => {
    const num = parseInt(match);
    if (num <= 999999) {
      return ` ${numberToWords(num)} `;
    }
    // Для очень больших чисел читаем по цифрам
    return ` ${match.split('').map(d => NUMBERS_0_19[parseInt(d)]).join(' ')} `;
  });
  
  // 7. Заменяем одиночные буквы-переменные (только в математическом контексте)
  // Ищем паттерны типа "x =", "= x", "x +", "+ x" и т.д.
  for (const [variable, word] of Object.entries(VARIABLES)) {
    // Переменная между операторами или в начале/конце выражения
    const patterns = [
      new RegExp(`\\b${variable}\\b(?=\\s*[+\\-×÷=<>])`, 'gi'),
      new RegExp(`(?<=[+\\-×÷=<>]\\s*)\\b${variable}\\b`, 'gi'),
      new RegExp(`\\b${variable}(?=[²³⁴⁵⁶⁷⁸⁹])`, 'gi'),
    ];
    for (const pattern of patterns) {
      result = result.replace(pattern, ` ${word} `);
    }
  }
  
  // 8. Убираем скобки (они не озвучиваются хорошо)
  result = result.replace(/[()[\]{}]/g, ' ');
  
  // 9. Очищаем множественные пробелы
  result = result.replace(/\s+/g, ' ').trim();
  
  // 10. Убираем специальные символы которые не озвучиваются
  result = result.replace(/[#@&*_~`|\\]/g, ' ');
  
  console.log(`[TTS-Convert] "${text.substring(0, 50)}..." → "${result.substring(0, 50)}..."`);
  
  return result;
}

/**
 * Проверяет, содержит ли текст математические выражения
 */
export function containsMath(text: string): boolean {
  // LaTeX
  if (/\$.*?\$/.test(text)) return true;
  // Числа с операторами
  if (/\d+\s*[+\-×÷=<>]\s*\d+/.test(text)) return true;
  // Математические символы
  if (/[√∛∞παβγδθλμσφω∫∂∈∉∑]/.test(text)) return true;
  // Степени
  if (/[²³⁴⁵⁶⁷⁸⁹⁰¹ⁿ]/.test(text)) return true;
  // Дроби
  if (/\d+\/\d+/.test(text)) return true;
  
  return false;
}

export default convertTextForTTS;

