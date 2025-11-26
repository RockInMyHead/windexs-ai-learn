const API_URL = 'https://teacher.windexs.ru/api';

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
}): Promise<Course> => {
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
  return data.course;
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

