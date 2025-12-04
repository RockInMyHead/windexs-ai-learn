import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';

interface MathRendererProps {
  children: string;
  className?: string;
}

// Функция для парсинга текста с математическими выражениями
export const parseMath = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Регулярные выражения для поиска математических выражений
  // Ищем выражения в разных форматах:
  // 1. $$...$$ (block math)
  // 2. $...$ (inline math)
  // 3. [ ... ] (bracketed math)
  // 4. ( ... ) (parenthesized math)
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\[[^\[\]]*\]|\([^)]*\))/g;

  let match;
  while ((match = mathRegex.exec(text)) !== null) {
    // Добавляем текст до математического выражения
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const mathExpression = match[0];
    const isBlockMath = mathExpression.startsWith('$$');
    const isBracketedMath = mathExpression.startsWith('[');
    const isParenthesizedMath = mathExpression.startsWith('(');

    // Очищаем выражение от ограничителей
    let cleanExpression: string;
    if (isBlockMath) {
      cleanExpression = mathExpression.slice(2, -2);
    } else if (isBracketedMath) {
      cleanExpression = mathExpression.slice(1, -1);
    } else if (isParenthesizedMath) {
      cleanExpression = mathExpression.slice(1, -1);
    } else {
      // inline math with $
      cleanExpression = mathExpression.slice(1, -1);
    }

    // Очищаем выражение от лишних пробелов
    cleanExpression = cleanExpression.trim();

    try {
      if (isBlockMath || isBracketedMath) {
        // Блочные формулы (в скобках или $$)
        parts.push(<BlockMath key={match.index} math={cleanExpression} />);
      } else {
        // Строчные формулы (в скобках или $)
        parts.push(<InlineMath key={match.index} math={cleanExpression} />);
      }
    } catch (error) {
      // Если не удалось распарсить, показываем как обычный текст
      console.warn('Failed to parse math expression:', cleanExpression, error);
      parts.push(mathExpression);
    }

    lastIndex = match.index + mathExpression.length;
  }

  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const MathRenderer: React.FC<MathRendererProps> = ({ children, className }) => {
  const parsedContent = parseMath(children);

  return (
    <div className={className}>
      {parsedContent.map((part, index) => (
        <React.Fragment key={index}>
          {part}
        </React.Fragment>
      ))}
    </div>
  );
};

export default MathRenderer;

