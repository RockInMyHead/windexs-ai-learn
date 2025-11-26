import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Функция для преобразования courseId в читаемое название урока
export function getCourseDisplayName(courseId: string): string {
  if (!courseId) return "Урок";

  const parts = courseId.split('-');
  if (parts.length < 2) return courseId;

  // Названия предметов
  const subjectNames: Record<string, string> = {
    english: "Английский язык",
    russian: "Русский язык",
    math: "Математика",
    physics: "Физика",
    history: "История",
    geography: "География",
    social: "Обществознание",
    arabic: "Арабский язык",
    chinese: "Китайский язык",
    chemistry: "Химия",
    biology: "Биология"
  };

  // Обработка экзаменационных курсов (ege-russian, oge-math, etc.)
  const firstPart = parts[0];
  if (firstPart === 'ege' || firstPart === 'oge') {
    const examType = firstPart === 'ege' ? 'ЕГЭ' : 'ОГЭ';
    const subjectKey = parts[1];
    const subjectName = subjectNames[subjectKey] || subjectKey;
    return `${subjectName} - Подготовка к ${examType}`;
  }

  // Обработка обычных курсов (russian-grade-5, english-goal-travel, etc.)
  if (parts.length < 3) return courseId;

  const subjectId = parts[0];
  const optionType = parts[1]; // grade или goal
  const optionValue = parts.slice(2).join('-');

  // Названия целей
  const goalNames: Record<string, string> = {
    travel: "для путешествий",
    communication: "для общения",
    study: "для обучения",
    school: "Школьная программа",
    advanced: "Углубленное изучение"
  };

  const subjectName = subjectNames[subjectId] || subjectId;

  if (optionType === 'grade') {
    return `${subjectName} для ${optionValue} класса`;
  } else if (optionType === 'goal') {
    const goalName = goalNames[optionValue] || optionValue;
    return `${subjectName} - ${goalName}`;
  }

  return courseId;
}
