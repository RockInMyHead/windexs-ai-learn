const API_URL = 'http://localhost:3001/api';

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

