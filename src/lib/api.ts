const API_URL = import.meta.env.VITE_API_URL || 'https://teacher.windexs.ru/api';

// ==================== Payment Types ====================
export interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  lessons: number | null;
  voiceSessions: number | null;
  type: string;
  description: string;
}

export interface UserSubscription {
  hasSubscription: boolean;
  plan: string | null;
  planName: string | null;
  lessonsRemaining: number;
  voiceSessionsRemaining: number;
  isUnlimited: boolean;
  expiresAt: number | null;
  startedAt: number | null;
}

export interface AccessCheck {
  hasAccess: boolean;
  remaining?: number;
  total?: number;
  used?: number;
  isUnlimited?: boolean;
  reason?: string;
}

// Performance / grades
export interface PerformanceRecord {
  id: string;
  topic: string;
  grade: number;
  created_at: number;
}

export const getPerformance = async (courseId: string): Promise<PerformanceRecord[]> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/performance/${courseId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Ошибка получения успеваемости');
  const data = await response.json();
  return data.items || [];
};

export const addPerformance = async (courseId: string, payload: { topic: string; grade: number }): Promise<PerformanceRecord> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/performance/${courseId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Ошибка сохранения успеваемости');
  }
  return response.json();
};

// ==================== Payment API ====================
export const getPaymentPlans = async (): Promise<PaymentPlan[]> => {
  const response = await fetch(`${API_URL}/payments/plans`);
  if (!response.ok) throw new Error('Ошибка получения тарифов');
  const data = await response.json();
  return data.plans;
};

export const getUserSubscription = async (): Promise<UserSubscription> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/payments/subscription`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Ошибка получения подписки');
  return response.json();
};

export const checkAccess = async (feature: 'lessons' | 'voice'): Promise<AccessCheck> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/payments/access/${feature}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Ошибка проверки доступа');
  return response.json();
};

export const useLesson = async (): Promise<{ success: boolean; remaining: number }> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/payments/use-lesson`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка списания урока');
  }
  return response.json();
};

export const useVoiceSession = async (): Promise<{ success: boolean; remaining: number }> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/payments/use-voice`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка списания голосовой сессии');
  }
  return response.json();
};

export const createPayment = async (plan: string): Promise<{ success: boolean; paymentId: string; confirmationUrl: string }> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/payments/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ plan })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка создания платежа');
  }
  return response.json();
};

export const createFreeTrial = async (): Promise<{ success: boolean; lessonsRemaining: number; voiceSessionsRemaining: number }> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/payments/create-trial`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка создания пробного периода');
  }
  return response.json();
};

export interface Course {
  id: string;
  subject_id: string;
  subject_name: string;
  grade: string | null;
  goal: string | null;
  goal_name: string | null;
  icon: string;
  progress: number;
  next_lesson: string;
  created_at: string;
}

// Get auth token
const getToken = () => localStorage.getItem('token');

// Get user's courses
export const getCourses = async (): Promise<Course[]> => {
  const token = getToken();
  if (!token) return [];

  const response = await fetch(`${API_URL}/courses`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Ошибка загрузки курсов');
  }

  const data = await response.json();
  return data.courses;
};

// Add course to library
export const addCourse = async (courseData: {
  subjectId: string;
  subjectName: string;
  grade?: string;
  goal?: string;
  goalName?: string;
  icon?: string;
}): Promise<{ course: Course; isDuplicate: boolean }> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(courseData)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка добавления курса');
  }

  const data = await response.json();
  const isDuplicate = data.message === 'Курс уже добавлен';

  return { course: data.course, isDuplicate };
};

// Update course progress
export const updateCourseProgress = async (courseId: string, progress: number, nextLesson?: string): Promise<Course> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/courses/${courseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ progress, nextLesson })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка обновления курса');
  }

  const data = await response.json();
  return data.course;
};

// Delete course from library
export const deleteCourse = async (courseId: string): Promise<void> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/courses/${courseId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка удаления курса');
  }
};

// Learning profile types
export interface LearningProfile {
  id: number;
  user_id: string;
  course_id: string;
  strong_topics?: string;
  weak_topics?: string;
  homework_history?: string;
  current_homework?: string;
  current_homework_status?: string;
  learning_style?: string;
  learning_pace?: string;
  current_topic_understanding?: number;
  teacher_notes?: string;
  next_lesson_recommendations?: string;
  subject_mastery_percentage?: number;
  topics_completed?: number;
  last_activity_at?: string;
  created_at: string;
  updated_at: string;
}

// Get learning profile for specific course
export const getLearningProfile = async (courseId: string): Promise<LearningProfile> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/learning-profile/${courseId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка получения профиля обучения');
  }

  const data = await response.json();
  return data.profile;
};

// Update learning profile
export const updateLearningProfile = async (courseId: string, updates: Partial<LearningProfile>): Promise<LearningProfile> => {
  const token = getToken();
  if (!token) throw new Error('Не авторизован');

  const response = await fetch(`${API_URL}/learning-profile/${courseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Ошибка обновления профиля обучения');
  }

  const data = await response.json();
  return data.profile;
};

