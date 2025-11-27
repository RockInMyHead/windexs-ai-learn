/**
 * Детектор эха TTS на основе текстовой корреляции
 * Сравнивает распознанный текст с эталонным текстом TTS
 */
export class TextCorrelationDetector {
  private ttsText = '';
  private lastProcessedText = '';

  /**
   * Установка текста TTS для анализа
   */
  setTTSText(text: string): void {
    this.ttsText = text.toLowerCase().trim();
    this.lastProcessedText = '';
    console.log('📝 TTS text set for correlation analysis');
  }

  /**
   * Очистка текста TTS
   */
  clearTTSText(): void {
    this.ttsText = '';
    this.lastProcessedText = '';
  }

  /**
   * Расчет схожести текста с TTS
   */
  calculateTextSimilarity(recognizedText: string): number {
    if (!this.ttsText || !recognizedText) return 0;

    const cleanRecognized = recognizedText.toLowerCase().trim();

    // Точное совпадение
    if (this.ttsText.includes(cleanRecognized)) {
      console.log('📝 Exact text match found');
      return 1.0;
    }

    // Частичное совпадение с учетом расстояния Левенштейна
    const words = cleanRecognized.split(/\s+/);
    const ttsWords = this.ttsText.split(/\s+/);

    let matchedWords = 0;
    let consecutiveMatches = 0;
    let maxConsecutive = 0;

    // Проверяем каждое слово из распознанного текста
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordIndex = ttsWords.findIndex(ttsWord =>
        this.levenshteinDistance(word, ttsWord) <= 1 || // Расстояние <= 1
        ttsWord.includes(word) || word.includes(ttsWord)
      );

      if (wordIndex !== -1) {
        matchedWords++;

        // Проверяем на последовательность слов
        if (i > 0) {
          const prevWord = words[i - 1];
          const prevWordIndex = ttsWords.findIndex(ttsWord =>
            this.levenshteinDistance(prevWord, ttsWord) <= 1
          );

          if (wordIndex === prevWordIndex + 1) {
            consecutiveMatches++;
          } else {
            maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
            consecutiveMatches = 1;
          }
        } else {
          consecutiveMatches = 1;
        }
      }
    }

    maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);

    // Расчет различных метрик схожести
    const wordMatchRatio = matchedWords / words.length;
    const sequenceBonus = maxConsecutive / words.length;
    const lengthSimilarity = 1 - Math.abs(words.length - this.getExpectedLength()) / Math.max(words.length, this.getExpectedLength());

    // Взвешенная оценка
    const totalSimilarity = (
      wordMatchRatio * 0.6 +      // 60% - совпадение слов
      sequenceBonus * 0.3 +       // 30% - последовательность
      lengthSimilarity * 0.1      // 10% - схожесть длины
    );

    console.log('📝 Text correlation analysis:', {
      recognized: cleanRecognized,
      wordMatch: wordMatchRatio.toFixed(3),
      sequence: sequenceBonus.toFixed(3),
      length: lengthSimilarity.toFixed(3),
      total: totalSimilarity.toFixed(3)
    });

    return totalSimilarity;
  }

  /**
   * Ожидаемая длина распознанного текста
   */
  private getExpectedLength(): number {
    // Обычно распознавание дает 2-4 слова за раз
    // Для коротких TTS текстов ожидаем меньше слов
    const ttsLength = this.ttsText.split(/\s+/).length;
    if (ttsLength <= 5) return Math.min(2, ttsLength);
    if (ttsLength <= 15) return Math.min(4, ttsLength);
    return Math.min(6, ttsLength);
  }

  /**
   * Расстояние Левенштейна для нечеткого сравнения слов
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    // Инициализация матрицы
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Заполнение матрицы
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // Замена
            matrix[i][j - 1] + 1,     // Вставка
            matrix[i - 1][j] + 1      // Удаление
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Проверка является ли текст эхом (упрощенная версия)
   */
  isLikelyEcho(recognizedText: string, threshold = 0.6): boolean {
    const similarity = this.calculateTextSimilarity(recognizedText);
    return similarity > threshold;
  }
}
