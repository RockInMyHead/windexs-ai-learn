import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import multer from 'multer';
import db from './database.js';

// Configure multer for audio file uploads
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    console.log('File filter check:', {
      mimetype: file.mimetype,
      originalname: file.originalname
    });
    // Accept only audio files supported by Whisper
    if (file.mimetype.startsWith('audio/') ||
        file.mimetype === 'application/octet-stream' ||
        file.originalname.endsWith('.webm') ||
        file.originalname.endsWith('.wav') ||
        file.originalname.endsWith('.mp3') ||
        file.originalname.endsWith('.m4a') ||
        file.originalname.endsWith('.mp4') ||
        file.originalname.endsWith('.flac') ||
        file.originalname.endsWith('.ogg')) {
      cb(null, true);
    } else {
      console.error('Rejected file type:', file.mimetype);
      cb(new Error(`Only audio files are allowed. Got: ${file.mimetype}`));
    }
  }
});

dotenv.config();

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'windexs-ai-learn-secret-key-2024';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Proxy configuration (enabled by default)
const PROXY_ENABLED = process.env.PROXY_ENABLED !== 'false';
const PROXY_HOST = process.env.PROXY_HOST || '185.68.187.20';
const PROXY_PORT = process.env.PROXY_PORT || '8000';
const PROXY_USERNAME = process.env.PROXY_USERNAME || 'rBD9e6';
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || 'jZdUnJ';

// Initialize OpenAI client
let openai = null;
if (OPENAI_API_KEY) {
  if (PROXY_ENABLED) {
    const proxyUrl = `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      httpAgent: proxyAgent
    });

    console.log('🤖 OpenAI клиент инициализирован с прокси:', `${PROXY_HOST}:${PROXY_PORT}`);
  } else {
    openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
    console.log('🤖 OpenAI клиент инициализирован без прокси');
  }
} else {
  console.log('⚠️ OpenAI API ключ не найден');
}

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow localhost origins for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    // Allow production domain
    if (origin === 'https://teacher.windexs.ru') {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth middleware called for:', req.path, 'Token present:', !!token);

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if session exists and is valid, create/update automatically
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (session) {
      const expiresAt = new Date(session.expires_at);
      if (expiresAt < new Date()) {
        // Session expired, extend automatically
        console.log('🔄 Продление истекшей сессии для пользователя:', decoded.userId);
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(newExpiresAt, token);
      }
    } else {
      // Session not found, create new one automatically
      console.log('🆕 Создание новой сессии для пользователя:', decoded.userId);
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
        uuidv4(),
        decoded.userId,
        token,
        newExpiresAt
      );
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
};

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create user
    db.prepare('INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)').run(userId, email, hashedPassword, name);

    // Create session
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(sessionId, userId, token, expiresAt);

    res.status(201).json({
      message: 'Регистрация успешна',
      user: { id: userId, email, name },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Create session
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(sessionId, user.id, token, expiresAt);

    res.json({
      message: 'Вход выполнен успешно',
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.json({ message: 'Выход выполнен успешно' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, name, avatar, created_at FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.user.userId;

    if (email) {
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
      if (existingUser) {
        return res.status(400).json({ error: 'Email уже используется' });
      }
    }

    const updates = [];
    const values = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (email) {
      updates.push('email = ?');
      values.push(email);
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      values.push(userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const user = db.prepare('SELECT id, email, name, avatar FROM users WHERE id = ?').get(userId);
    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Change password
app.put('/api/auth/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
    const validPassword = await bcrypt.compare(currentPassword, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?').run(hashedPassword, userId);

    res.json({ message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Delete account
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Delete all sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    // Delete user courses
    db.prepare('DELETE FROM user_courses WHERE user_id = ?').run(userId);
    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'Аккаунт удален' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== COURSES API ====================

// Get user's courses
app.get('/api/courses', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const courses = db.prepare(`
      SELECT id, subject_id, subject_name, grade, goal, goal_name, icon, progress, next_lesson, created_at
      FROM user_courses
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(userId);

    console.log(`📚 Получение курсов для пользователя ${userId}: найдено ${courses.length} курсов`);
    courses.forEach(course => {
      console.log(`  - ${course.id}: ${course.subject_name} (${course.goal_name || 'без цели'})`);
    });

    res.json({ courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Add/enroll in a course
app.post('/api/courses', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { subjectId, subjectName, grade, goal, goalName, icon } = req.body;

    if (!subjectId || !subjectName) {
      return res.status(400).json({ error: 'Предмет обязателен' });
    }

    // Check if course already exists
    const existingCourse = db.prepare(`
      SELECT id FROM user_courses 
      WHERE user_id = ? AND subject_id = ? AND (grade = ? OR grade IS NULL) AND (goal = ? OR goal IS NULL)
    `).get(userId, subjectId, grade || null, goal || null);

    if (existingCourse) {
      // Update existing course
      db.prepare(`
        UPDATE user_courses 
        SET updated_at = datetime("now")
        WHERE id = ?
      `).run(existingCourse.id);
      
      const course = db.prepare('SELECT * FROM user_courses WHERE id = ?').get(existingCourse.id);
      return res.json({ course, message: 'Курс уже добавлен' });
    }

    // Create new course enrollment
    const courseId = uuidv4();
    const nextLesson = getFirstLesson(subjectId, grade, goal);

    db.prepare(`
      INSERT INTO user_courses (id, user_id, subject_id, subject_name, grade, goal, goal_name, icon, progress, next_lesson)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(courseId, userId, subjectId, subjectName, grade || null, goal || null, goalName || null, icon || '📚', nextLesson);

    const course = db.prepare('SELECT * FROM user_courses WHERE id = ?').get(courseId);
    
    res.status(201).json({ course, message: 'Курс добавлен в библиотеку' });
  } catch (error) {
    console.error('Add course error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update course progress
app.put('/api/courses/:courseId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;
    const { progress, nextLesson } = req.body;

    const course = db.prepare('SELECT * FROM user_courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      return res.status(404).json({ error: 'Курс не найден' });
    }

    const updates = ['updated_at = datetime("now")'];
    const values = [];

    if (progress !== undefined) {
      updates.push('progress = ?');
      values.push(progress);
    }
    if (nextLesson) {
      updates.push('next_lesson = ?');
      values.push(nextLesson);
    }

    values.push(courseId);
    db.prepare(`UPDATE user_courses SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updatedCourse = db.prepare('SELECT * FROM user_courses WHERE id = ?').get(courseId);
    res.json({ course: updatedCourse });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Delete course from library
app.delete('/api/courses/:courseId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;

    const course = db.prepare('SELECT * FROM user_courses WHERE id = ? AND user_id = ?').get(courseId, userId);
    if (!course) {
      return res.status(404).json({ error: 'Курс не найден' });
    }

    db.prepare('DELETE FROM user_courses WHERE id = ?').run(courseId);
    res.json({ message: 'Курс удален из библиотеки' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Helper function to get first lesson based on subject
function getFirstLesson(subjectId, grade, goal) {
  const lessons = {
    russian: { default: 'Введение в русский язык', '5': 'Фонетика и орфоэпия', '6': 'Морфемика', '7': 'Морфология', '8': 'Синтаксис', '9': 'Сложное предложение', '10': 'Стилистика', '11': 'Подготовка к ЕГЭ' },
    math: { default: 'Введение в математику', '5': 'Натуральные числа', '6': 'Дроби', '7': 'Алгебраические выражения', '8': 'Квадратные уравнения', '9': 'Функции', '10': 'Тригонометрия', '11': 'Производная' },
    english: { default: 'Introduction', travel: 'Приветствия и знакомство', communication: 'Базовые диалоги', study: 'Грамматика: Времена' },
    physics: { default: 'Введение в физику', '7': 'Механика', '8': 'Тепловые явления', '9': 'Электричество', '10': 'Кинематика', '11': 'Квантовая физика' },
    chinese: { default: '你好 - Приветствие', travel: 'Базовые фразы для путешествий', communication: 'Повседневные диалоги', study: 'Иероглифика' },
    arabic: { default: 'مرحبا - Приветствие', travel: 'Фразы для путешествий', communication: 'Разговорный арабский', study: 'Арабский алфавит' }
  };

  const subjectLessons = lessons[subjectId] || { default: 'Введение' };
  
  if (goal && subjectLessons[goal]) {
    return subjectLessons[goal];
  }
  if (grade && subjectLessons[grade]) {
    return subjectLessons[grade];
  }
  return subjectLessons.default;
}

// ==================== CHAT API ====================

// Subject names for prompts
const subjectNamesRu = {
  russian: 'Русский язык',
  math: 'Математика',
  english: 'Английский язык',
  physics: 'Физика',
  history: 'История',
  geography: 'География',
  social: 'Обществознание',
  arabic: 'Арабский язык',
  chinese: 'Китайский язык'
};

// Generate voice chat prompt for conversational AI teacher
function generateVoiceChatPrompt(courseId, userProfile, learningProfile, pendingHomework) {
  const parts = courseId.split('-');
  const subjectId = parts[0];
  const optionType = parts[1];
  const optionValue = parts.slice(2).join('-');

  const subjectName = subjectNamesRu[subjectId] || subjectId;
  let courseContext = subjectName;

  if (optionType === 'grade') {
    courseContext = `${subjectName} для ${optionValue} класса`;
  } else if (optionType === 'goal') {
    const goalNames = {
      travel: 'для путешествий',
      communication: 'для общения',
      study: 'для обучения'
    };
    courseContext = `${subjectName} - ${goalNames[optionValue] || optionValue}`;
  }

  const difficultyMap = {
    easy: 'простым языком с большим количеством примеров',
    medium: 'понятным языком с примерами',
    hard: 'углубленно с детальными объяснениями'
  };

  const learningStyleMap = {
    visual: 'Используй визуальные описания, схемы и примеры.',
    auditory: 'Объясняй так, как будто рассказываешь вслух, используй аналогии.',
    kinesthetic: 'Давай практические задания и упражнения.',
    reading: 'Предоставляй структурированный текст с заголовками.'
  };

  let homeworkContext = '';
  if (pendingHomework && pendingHomework.length > 0) {
    homeworkContext = `\n\nУ ученика есть невыполненные домашние задания:\n${pendingHomework.map(h => `- ${h.title}: ${h.description || 'без описания'}`).join('\n')}\nПроверь выполнение при возможности.`;
  }

  let teacherIntro = `Ты - профессиональный учитель Юлия. Ты помогаешь ученикам изучать ${courseContext} весело и интересно.`;

  // Add user-specific information if available
  if (userProfile?.name) {
    teacherIntro += ` Ты общаешься с учеником ${userProfile.name}.`;
  }

  if (userProfile?.interests) {
    let interestsStr = '';
    if (typeof userProfile.interests === 'string') {
      interestsStr = userProfile.interests;
    } else if (Array.isArray(userProfile.interests)) {
      interestsStr = userProfile.interests.join(', ');
    }
    if (interestsStr) {
      teacherIntro += ` Ученик интересуется: ${interestsStr}.`;
    }
  }

  // Add learning profile information
  if (learningProfile) {
    if (learningProfile.strong_topics) {
      teacherIntro += ` Сильные темы ученика: ${learningProfile.strong_topics}.`;
    }
    if (learningProfile.weak_topics) {
      teacherIntro += ` Слабые темы ученика: ${learningProfile.weak_topics}.`;
    }
    if (learningProfile.current_topic_understanding) {
      teacherIntro += ` Текущий уровень понимания темы: ${learningProfile.current_topic_understanding}/10.`;
    }
    if (learningProfile.subject_mastery_percentage) {
      teacherIntro += ` Общий процент освоения предмета: ${learningProfile.subject_mastery_percentage}%.`;
    }
    if (learningProfile.teacher_notes) {
      teacherIntro += ` Заметки о ученике: ${learningProfile.teacher_notes}.`;
    }
  }

  return `${teacherIntro}

Ты ведешь естественные разговорные уроки в голосовом формате. Каждый урок длится около 5 минут и следует невидимой структуре: знакомство с темой → объяснение теории → практическое упражнение → обсуждение результатов → домашнее задание.

ВАЖНЫЕ ПРАВИЛА:
1. Веди урок естественно, как настоящий учитель в живом разговоре - используй "я", "ты", обращайся по имени если знаешь
2. Объясняй ${difficultyMap[userProfile?.difficulty_level || 'medium']}
3. ${learningStyleMap[userProfile?.learning_style || 'auditory']} (поскольку это голосовое общение)
4. ЗАДАВАЙ ТОЛЬКО ОДИН ВОПРОС ЗА РАЗ и ЖДИ ОТВЕТА ученика
5. Не сыпь множеством вопросов подряд - это сбивает с толку
6. Следи за временем - урок должен уложиться в 5 минут
7. Поощряй успехи ученика и давай позитивную обратную связь
8. Используй эмодзи для дружелюбного общения 📚✨
9. Отвечай на русском языке
10. Адаптируй материал под уровень и интересы ученика
11. В конце каждого урока обязательно давай домашнее задание

СТИЛЬ ОТВЕТОВ:
- Пиши естественно, без форматирования и заголовков
- Не используй markdown (**текст**), курсив, списки с номерами
- Не указывай явно "ТЕОРИЯ", "ПРАКТИКА", "РЕФЛЕКСИЯ" - просто веди разговор
- Делай ответы краткими и подходящими для голосового общения
- Переходи плавно от одного этапа урока к другому

ОБРАБОТКА ПРЕРВАННЫХ РАЗГОВОРОВ:
- Если пользователь прервал озвучку вопроса, учти предыдущий контекст и продолжи урок
- Не повторяй уже сказанное, плавно переходи к следующему этапу урока
- Учитывай, что ученик мог ответить на предыдущий вопрос во время прерывания

ПОРЯДОК ВЕДЕНИЯ УРОКА:
- Начало: Спроси, что хочет изучить или с чем помочь
- Теория: Дай небольшую порцию теории, потом спроси один вопрос для проверки понимания
- Практика: Предложи простое упражнение, потом спроси об ощущениях
- Рефлексия: Обсуди результаты, задай вопрос о значении материала
- Завершение: Дай домашнее задание и подведи итоги${homeworkContext}

Текущий курс: ${courseContext}`;
}

// Generate system prompt based on course and user profile
function generateSystemPrompt(courseId, userProfile, pendingHomework) {
  const parts = courseId.split('-');
  const subjectId = parts[0];
  const optionType = parts[1];
  const optionValue = parts.slice(2).join('-');

  const subjectName = subjectNamesRu[subjectId] || subjectId;
  let courseContext = subjectName;

  if (optionType === 'grade') {
    courseContext = `${subjectName} для ${optionValue} класса`;
  } else if (optionType === 'goal') {
    const goalNames = {
      travel: 'для путешествий',
      communication: 'для общения',
      study: 'для обучения'
    };
    courseContext = `${subjectName} - ${goalNames[optionValue] || optionValue}`;
  }

  const difficultyMap = {
    easy: 'простым языком с большим количеством примеров',
    medium: 'понятным языком с примерами',
    hard: 'углубленно с детальными объяснениями'
  };

  const learningStyleMap = {
    visual: 'Используй визуальные описания, схемы и примеры.',
    auditory: 'Объясняй так, как будто рассказываешь вслух, используй аналогии.',
    kinesthetic: 'Давай практические задания и упражнения.',
    reading: 'Предоставляй структурированный текст с заголовками.'
  };

  let homeworkContext = '';
  if (pendingHomework && pendingHomework.length > 0) {
    homeworkContext = `\n\nУ ученика есть невыполненные домашние задания:\n${pendingHomework.map(h => `- ${h.title}: ${h.description || 'без описания'}`).join('\n')}\nПроверь выполнение при возможности.`;
  }

  return `Ты - AI-преподаватель платформы Windexs-Учитель. Твоя задача - помогать ученику изучать "${courseContext}".

Правила общения:
1. Отвечай ${difficultyMap[userProfile?.difficulty_level || 'medium']}
2. ${learningStyleMap[userProfile?.learning_style || 'visual']}
3. Будь терпеливым и поддерживающим
4. Если ученик делает ошибку, мягко поправь и объясни правильный вариант
5. Задавай уточняющие вопросы, чтобы лучше понять уровень знаний
6. Предлагай практические задания для закрепления материала
7. Отвечай на русском языке
8. Используй эмодзи для дружелюбного общения 📚✨
9. В конце сложных тем предлагай домашнее задание

Текущий курс: ${courseContext}
${homeworkContext}

Помни: ты не просто отвечаешь на вопросы, а ведешь полноценный урок, адаптируясь под ученика.`;
}

// Get or create user profile
function getOrCreateUserProfile(userId) {
  let profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  
  if (!profile) {
    const profileId = uuidv4();
    db.prepare(`
      INSERT INTO user_profiles (id, user_id)
      VALUES (?, ?)
    `).run(profileId, userId);
    profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  }
  
  return profile;
}

// Get pending homework for course
function getPendingHomework(userId, courseId) {
  return db.prepare(`
    SELECT * FROM homework
    WHERE user_id = ? AND course_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 5
  `).all(userId, courseId);
}

// Get or create user learning profile for specific course
function getOrCreateUserLearningProfile(userId, courseId) {
  let profile = db.prepare('SELECT * FROM user_learning_profiles WHERE user_id = ? AND course_id = ?').get(userId, courseId);

  if (!profile) {
    const profileId = db.prepare(`
      INSERT INTO user_learning_profiles (
        user_id, course_id, learning_style, learning_pace,
        current_topic_understanding, subject_mastery_percentage,
        topics_completed, last_activity_at, created_at, updated_at
      ) VALUES (?, ?, 'visual', 'normal', 5, 0.0, 0, ?, ?, ?)
    `).run(userId, courseId, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()).lastInsertRowid;

    profile = db.prepare('SELECT * FROM user_learning_profiles WHERE id = ?').get(profileId);
  }

  return profile;
}

// Update user learning profile
function updateUserLearningProfile(userId, courseId, updates) {
  const fields = [];
  const values = [];

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  });

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    fields.push('last_activity_at = ?');
    values.push(new Date().toISOString(), new Date().toISOString());

    values.push(userId, courseId);

    db.prepare(`
      UPDATE user_learning_profiles
      SET ${fields.join(', ')}
      WHERE user_id = ? AND course_id = ?
    `).run(...values);
  }

  return getOrCreateUserLearningProfile(userId, courseId);
}

// Get chat history (last 30 messages)
app.get('/api/chat/:courseId/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;

    const messages = db.prepare(`
      SELECT id, role, content, message_type, file_url, created_at
      FROM chat_messages
      WHERE user_id = ? AND course_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(userId, courseId);

    // Reverse to get chronological order
    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Helper function to ensure course exists and return its ID
function ensureCourseExists(userId, courseId) {
  // Support legacy records where id === courseId (e.g. "russian-grade-5")
  const legacyCourse = db.prepare('SELECT id FROM user_courses WHERE id = ? AND user_id = ?').get(courseId, userId);
  if (legacyCourse) {
    return courseId;
  }

  // Parse courseId to check for existing course with same parameters
  const parts = courseId.split('-');
  const firstPart = parts[0];
  let subjectId;
  let grade = null;
  let goal = null;

  // Handle exam courses (ege-russian, oge-math, etc.)
  if (firstPart === 'ege' || firstPart === 'oge') {
    subjectId = parts[1]; // e.g. "russian", "math"
    goal = firstPart; // e.g. "ege" or "oge"
    console.log(`📚 Экзаменационный курс: subjectId=${subjectId}, goal=${goal}, courseId=${courseId}`);
  } else {
    // Regular courses (russian-grade-5, english-goal-travel, etc.)
    subjectId = parts[0];
    const optionType = parts[1];

    if (optionType === 'grade') {
      grade = parts[2];
    } else if (optionType === 'goal') {
      goal = parts.slice(2).join('-'); // e.g. "travel", "communication", "study"
    }
  }

  // Check if course with same subject, grade/goal already exists for this user
  const existingCourse = db.prepare(`
    SELECT id FROM user_courses
    WHERE user_id = ? AND subject_id = ? AND (grade = ? OR grade IS NULL) AND (goal = ? OR goal IS NULL)
  `).get(userId, subjectId, grade, goal);

  if (existingCourse) {
    // Return the original courseId, not the database ID
    console.log('📚 Найден существующий курс, возвращаем оригинальный courseId:', courseId);
    return courseId;
  }

  // Use user-specific course id to avoid collisions across users
  const userCourseId = `${courseId}-${userId}`;

  // If we already created user-specific course earlier, reuse it
  const userSpecificCourse = db.prepare('SELECT id FROM user_courses WHERE id = ? AND user_id = ?').get(userCourseId, userId);
  if (userSpecificCourse) {
    return userCourseId;
  }
  // Map subject IDs to names
  const subjectNames = {
    russian: 'Русский язык',
    english: 'Английский язык',
    math: 'Математика',
    physics: 'Физика',
    chemistry: 'Химия',
    biology: 'Биология',
    history: 'История',
    geography: 'География',
    social: 'Обществознание',
    arabic: 'Арабский язык',
    chinese: 'Китайский язык'
  };

  const subjectName = subjectNames[subjectId] || subjectId;

  // Set goalName for display purposes
  let goalName = null;
  if (goal === 'ege') {
    goalName = 'Подготовка к ЕГЭ';
  } else if (goal === 'oge') {
    goalName = 'Подготовка к ОГЭ';
  } else if (optionType === 'goal') {
    goalName = goal; // goal is already set above
  }

  // Create the course
  const nextLesson = getFirstLesson(subjectId, grade, goal);

  // Set appropriate icon for exam courses
  const courseIcon = (goal === 'ege' || goal === 'oge') ? '🎓' : '📚';

  console.log(`📚 Создание курса: id=${userCourseId}, subjectId=${subjectId}, subjectName=${subjectName}, grade=${grade}, goal=${goal}, goalName=${goalName}, icon=${courseIcon}`);

  db.prepare(`
    INSERT INTO user_courses (id, user_id, subject_id, subject_name, grade, goal, goal_name, icon, progress, next_lesson)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(userCourseId, userId, subjectId, subjectName, grade, goal, goalName, courseIcon, nextLesson);

  console.log(`📚 Автоматически создан курс: ${subjectName} для пользователя ${userId} (id: ${userCourseId})`);
  return userCourseId;
}

// Send message and get AI response (streaming)
app.post('/api/chat/:courseId/message', authenticateToken, async (req, res) => {
  try {
    console.log('📨 Новый запрос к /api/chat/:courseId/message');
    console.log('👤 User ID:', req.user?.userId);
    console.log('📋 Course ID:', req.params.courseId);
    console.log('💬 Content:', req.body.content);
    console.log('🎤 Message Type:', req.body.messageType);

    const userId = req.user.userId;
    const { courseId: requestedCourseId } = req.params;
    const { content, messageType = 'text' } = req.body;

    // Ensure course exists and get actual course ID
    const courseId = ensureCourseExists(userId, requestedCourseId);

    console.log('✅ Проверка контента пройдена');

    if (!content || !content.trim()) {
      console.log('❌ Контент пустой');
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Save user message
    console.log('💾 Сохранение сообщения пользователя...');
    const userMessageId = uuidv4();
    db.prepare(`
      INSERT INTO chat_messages (id, user_id, course_id, role, content, message_type)
      VALUES (?, ?, ?, 'user', ?, ?)
    `).run(userMessageId, userId, courseId, content.trim(), messageType);
    console.log('✅ Сообщение пользователя сохранено, ID:', userMessageId);

    // Get user profile and learning profile
    console.log('👤 Получение профиля пользователя...');
    const userProfile = getOrCreateUserProfile(userId);
    const learningProfile = getOrCreateUserLearningProfile(userId, courseId);
    console.log('✅ Профиль получен:', userProfile);
    console.log('✅ Профиль обучения получен:', learningProfile);

    // Get pending homework
    console.log('📚 Получение домашних заданий...');
    const pendingHomework = getPendingHomework(userId, courseId);
    console.log('✅ Домашние задания получены:', pendingHomework?.length || 0);

    // Get chat history for context (last 30 messages)
    console.log('📜 Получение истории чата...');
    const historyMessages = db.prepare(`
      SELECT role, content
      FROM chat_messages
      WHERE user_id = ? AND course_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(userId, courseId).reverse();
    console.log('✅ История чата получена, сообщений:', historyMessages.length);

    // Generate system prompt based on message type
    console.log('🤖 Генерация системного промпта...');
    const isVoiceChat = messageType === 'voice';
    console.log('🎤 Это голосовой чат?', isVoiceChat);
    const systemPrompt = isVoiceChat
      ? generateVoiceChatPrompt(courseId, userProfile, learningProfile, pendingHomework)
      : generateSystemPrompt(courseId, userProfile, pendingHomework);
    console.log('✅ Промпт сгенерирован, длина:', systemPrompt.length);

    // Prepare messages for OpenAI
    console.log('📝 Подготовка сообщений для OpenAI...');
    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: content.trim() }
    ];
    console.log('✅ Сообщения подготовлены, всего:', messages.length);

    // Check if OpenAI is configured
    if (!openai) {
      // Fallback response without OpenAI
      const fallbackResponse = generateFallbackResponse(content, courseId);
      
      const assistantMessageId = uuidv4();
      db.prepare(`
        INSERT INTO chat_messages (id, user_id, course_id, role, content, message_type)
        VALUES (?, ?, ?, 'assistant', ?, 'text')
      `).run(assistantMessageId, userId, courseId, fallbackResponse);

      // Update user profile stats
      db.prepare(`
        UPDATE user_profiles 
        SET total_messages = total_messages + 2, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(userId);

      return res.json({ 
        message: fallbackResponse,
        messageId: assistantMessageId 
      });
    }

    // Determine temperature based on course type
    const isLanguageCourse = ['english', 'chinese', 'arabic'].some(l => courseId.startsWith(l));
    const temperature = isLanguageCourse ? 0.7 : 0.3;

    // Special handling for voice chat: non-streaming JSON response
    if (isVoiceChat) {
      try {
        console.log('🎤 Voice chat запрос в OpenAI (без стриминга)...');
        console.log('📝 Сообщения для voice chat:', JSON.stringify(messages, null, 2));
        const completion = await openai.chat.completions.create({
          model: 'gpt-5.1',
          messages,
          temperature,
          max_completion_tokens: 400,
          stream: false
        });

        const fullResponse = completion.choices[0]?.message?.content || '';
        const tokensUsed = completion.usage?.total_tokens || 0;

        // Save assistant message
        const assistantMessageId = uuidv4();
        db.prepare(`
          INSERT INTO chat_messages (id, user_id, course_id, role, content, message_type, tokens_used)
          VALUES (?, ?, ?, 'assistant', ?, 'text', ?)
        `).run(assistantMessageId, userId, courseId, fullResponse, tokensUsed);

        // Update user profile stats
        db.prepare(`
          UPDATE user_profiles
          SET total_messages = total_messages + 2, updated_at = datetime('now')
          WHERE user_id = ?
        `).run(userId);

        // Update learning profile stats
        updateUserLearningProfile(userId, courseId, {
          topics_completed: (learningProfile.topics_completed || 0) + 1,
          subject_mastery_percentage: Math.min((learningProfile.subject_mastery_percentage || 0) + 5, 100)
        });

        return res.json({
          message: fullResponse,
          messageId: assistantMessageId
        });
      } catch (error) {
        console.error('❌ Ошибка OpenAI API (voice):', error);
        return res.status(500).json({
          error: 'Ошибка при обращении к AI (voice)',
          details: error.message
        });
      }
    }

    // For text chat: streaming response (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Call OpenAI with streaming
    console.log('🚀 Отправка запроса в OpenAI API (stream)...');
    console.log('📝 Сообщения для OpenAI:', JSON.stringify(messages, null, 2));

    let fullResponse = '';
    let tokensUsed = 0;

    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-5.1',
        messages,
        temperature,
        max_completion_tokens: 2000,
        stream: true
      });
      console.log('✅ OpenAI API ответил успешно');

      for await (const chunk of stream) {
        const contentPiece = chunk.choices[0]?.delta?.content || '';
        if (contentPiece) {
          fullResponse += contentPiece;
          res.write(`data: ${JSON.stringify({ content: contentPiece })}\n\n`);
        }

        if (chunk.usage) {
          tokensUsed = chunk.usage.total_tokens;
        }
      }
    } catch (error) {
      console.error('❌ Ошибка OpenAI API (stream):', error);
      console.error('❌ Детали ошибки OpenAI:', {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type
      });

      // Return error to client
      res.status(500).json({
        error: 'Ошибка при обращении к AI',
        details: error.message
      });
      return;
    }

    // Save assistant message
    const assistantMessageId = uuidv4();
    db.prepare(`
      INSERT INTO chat_messages (id, user_id, course_id, role, content, message_type, tokens_used)
      VALUES (?, ?, ?, 'assistant', ?, 'text', ?)
    `).run(assistantMessageId, userId, courseId, fullResponse, tokensUsed || 0);

    // Update user profile stats
    db.prepare(`
      UPDATE user_profiles 
      SET total_messages = total_messages + 2, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(userId);

    // Send end signal
    res.write(`data: ${JSON.stringify({ done: true, messageId: assistantMessageId })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Chat message error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка при обработке сообщения' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Ошибка при обработке сообщения' })}\n\n`);
      res.end();
    }
  }
});

// Fallback response generator when OpenAI is not available
function generateFallbackResponse(userMessage, courseId) {
  const parts = courseId.split('-');
  const subjectId = parts[0];
  const subjectName = subjectNamesRu[subjectId] || 'предмет';

  const responses = [
    `Отличный вопрос по ${subjectName}! 📚 К сожалению, AI-преподаватель временно недоступен. Пожалуйста, попробуйте позже или обратитесь к учебным материалам.`,
    `Спасибо за ваш интерес к изучению ${subjectName}! ✨ Сейчас система находится в режиме обслуживания. Скоро я смогу помочь вам с этой темой!`,
    `Я вижу, что вы хотите узнать больше о ${subjectName}. 🎓 AI-помощник скоро будет доступен. А пока рекомендую повторить предыдущий материал!`
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// Clear chat history
app.delete('/api/chat/:courseId/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;

    db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND course_id = ?').run(userId, courseId);

    res.json({ message: 'История чата очищена' });
  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== HOMEWORK API ====================

// Get homework for course
app.get('/api/homework/:courseId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;

    const homework = db.prepare(`
      SELECT * FROM homework
      WHERE user_id = ? AND course_id = ?
      ORDER BY created_at DESC
    `).all(userId, courseId);

    res.json({ homework });
  } catch (error) {
    console.error('Get homework error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Create homework (usually created by AI during lesson)
app.post('/api/homework/:courseId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;
    const { title, description, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Название задания обязательно' });
    }

    const homeworkId = uuidv4();
    db.prepare(`
      INSERT INTO homework (id, user_id, course_id, title, description, due_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(homeworkId, userId, courseId, title, description || null, dueDate || null);

    const homework = db.prepare('SELECT * FROM homework WHERE id = ?').get(homeworkId);
    res.status(201).json({ homework });
  } catch (error) {
    console.error('Create homework error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update homework status
app.put('/api/homework/:homeworkId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { homeworkId } = req.params;
    const { status, score, feedback } = req.body;

    const homework = db.prepare('SELECT * FROM homework WHERE id = ? AND user_id = ?').get(homeworkId, userId);
    if (!homework) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
      
      if (status === 'submitted') {
        updates.push('submitted_at = datetime("now")');
      } else if (status === 'checked' || status === 'completed') {
        updates.push('checked_at = datetime("now")');
      }
    }
    if (score !== undefined) {
      updates.push('score = ?');
      values.push(score);
    }
    if (feedback) {
      updates.push('feedback = ?');
      values.push(feedback);
    }

    if (updates.length > 0) {
      values.push(homeworkId);
      db.prepare(`UPDATE homework SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updatedHomework = db.prepare('SELECT * FROM homework WHERE id = ?').get(homeworkId);
    res.json({ homework: updatedHomework });
  } catch (error) {
    console.error('Update homework error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== GENERAL AI CHAT API ====================

// General AI chat (no course-specific, accessible to all users)
// Get general chat history
app.get('/api/chat/general/history', authenticateToken, (req, res) => {
  try {
    console.log('📚 Получение истории общего чата');
    const userId = req.user.userId;

    const messages = db.prepare(`
      SELECT id, role, content, created_at, message_type
      FROM chat_messages
      WHERE user_id = ? AND course_id = 'general'
      ORDER BY created_at ASC
      LIMIT 50
    `).all(userId);

    console.log('✅ История общего чата получена, сообщений:', messages.length);
    res.json({ messages });
  } catch (error) {
    console.error('❌ Ошибка получения истории общего чата:', error);
    res.status(500).json({ error: 'Ошибка получения истории чата' });
  }
});

app.post('/api/chat/general', upload.single('audio'), async (req, res) => {
  try {
    console.log('🤖 Новый запрос к общему AI чату');

    // Extract token from form data or headers
    let token = req.body.token || req.headers.authorization?.replace('Bearer ', '');
    console.log('🔑 Token:', token ? 'present' : 'missing');

    if (!token) {
      console.log('❌ Токен не найден');
      return res.status(401).json({ error: 'Токен не найден' });
    }

    // Verify token manually
    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      console.log('👤 User ID:', userId);
    } catch (tokenError) {
      console.log('❌ Недействительный токен');
      return res.status(401).json({ error: 'Недействительный токен' });
    }

    let content, messageType = 'text';

    // Handle voice messages (FormData)
    if (req.file) {
      console.log('🎤 Голосовое сообщение получено');
      messageType = 'voice';

      // Transcribe audio to text
      if (!openai) {
        console.error('OpenAI client not initialized');
        return res.status(500).json({ error: 'OpenAI API недоступен' });
      }

      const audioBuffer = req.file.buffer;
      console.log('🎵 Транскрибация аудио...');

      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
        model: "whisper-1",
        language: "ru"
      });

      content = transcription.text;
      console.log('✅ Аудио транскрибировано:', content);

      if (!content || !content.trim()) {
        console.log('❌ Транскрибация пуста');
        return res.status(400).json({ error: 'Не удалось распознать речь' });
      }
    } else {
      // Handle text messages (JSON)
      console.log('💬 Текстовое сообщение получено');
      content = req.body.content || req.body.text;

      if (!content || !content.trim()) {
        console.log('❌ Контент пустой');
        return res.status(400).json({ error: 'Сообщение не может быть пустым' });
      }
    }

    // Universal teacher prompt
    const systemPrompt = `Ты - Юлия, универсальный AI-учитель. Ты помогаешь людям изучать любые темы и предметы.

Ты ведешь естественные разговорные уроки. Каждый урок длится около 5 минут и следует невидимой структуре: знакомство с темой → объяснение теории → практическое упражнение → обсуждение результатов → домашнее задание.

ВАЖНЫЕ ПРАВИЛА:
1. Веди урок естественно, как настоящий учитель в живом разговоре - используй "я", "ты", обращайся по имени если знаешь
2. Объясняй понятно, адаптируй сложность под запрос пользователя
3. Задавай только один вопрос за раз и жди ответа ученика
4. Не сыпь множеством вопросов подряд - это сбивает с толку
5. Следи за временем - урок должен уложиться в 5 минут
6. Поощряй успехи ученика и давай позитивную обратную связь
7. Используй эмодзи для дружелюбного общения 📚✨
8. Отвечай на русском языке
9. Помогай с любыми темами: математика, программирование, языки, история, наука и т.д.
10. Для МАТЕМАТИЧЕСКИХ ФОРМУЛ используй LaTeX синтаксис в $...$ для строчных формул и $$...$$ для выносных формул

СТИЛЬ ОТВЕТОВ:
- Пиши естественно, без форматирования и заголовков
- Не используй markdown (**текст**), курсив, списки с номерами
- Делай ответы краткими и подходящими для голосового общения
- Переходи плавно от одного этапа урока к другому

Ты можешь помогать с:
- Решением задач и упражнений
- Объяснением сложных тем
- Практическими заданиями
- Домашними работами
- Подготовкой к экзаменам
- Изучением новых навыков`;

    // Prepare messages for OpenAI
    console.log('📝 Подготовка сообщений для OpenAI...');
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content.trim() }
    ];
    console.log('✅ Сообщения подготовлены');

    // Check if OpenAI is configured
    if (!openai) {
      // Fallback response without OpenAI
      const fallbackResponse = 'Привет! Я Юлия, твой AI-учитель. Я могу помочь тебе с изучением любых предметов: математика, программирование, языки, науки и многое другое. Что тебя интересует сегодня?';
      return res.json({ message: fallbackResponse });
    }

    console.log('🚀 Отправка запроса в OpenAI API...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages,
      temperature: 0.7,
      max_completion_tokens: 1000,
      stream: false
    });

    const fullResponse = completion.choices[0]?.message?.content || 'Извини, я не смогла сформулировать ответ. Попробуй перефразировать вопрос.';
    const tokensUsed = completion.usage?.total_tokens || 0;

    console.log('✅ AI ответил, токенов:', tokensUsed);

    // Save messages to database (using 'general' as courseId for general chat)
    try {
      console.log('💾 Сохранение сообщений в базу данных...');

      // Save user message
      const userMessageId = uuidv4();
      db.prepare(`
        INSERT INTO chat_messages (id, user_id, course_id, role, content, message_type)
        VALUES (?, ?, ?, 'user', ?, ?)
      `).run(userMessageId, userId, 'general', content.trim(), messageType);

      // Save AI response
      const aiMessageId = uuidv4();
      db.prepare(`
        INSERT INTO chat_messages (id, user_id, course_id, role, content, message_type)
        VALUES (?, ?, ?, 'assistant', ?, 'text')
      `).run(aiMessageId, userId, 'general', fullResponse, tokensUsed);

      console.log('✅ Сообщения сохранены в БД');
    } catch (dbError) {
      console.error('❌ Ошибка сохранения в БД:', dbError);
      // Don't fail the request if DB save fails
    }

    return res.json({
      message: fullResponse,
      tokensUsed
    });

  } catch (error) {
    console.error('❌ Ошибка общего AI чата:', error);
    return res.status(500).json({
      error: 'Ошибка при обращении к AI',
      details: error.message
    });
  }
});

// ==================== USER PROFILE API ====================

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const profile = getOrCreateUserProfile(userId);
    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Get user learning profile for specific course
app.get('/api/learning-profile/:courseId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;
    const profile = getOrCreateUserLearningProfile(userId, courseId);
    res.json({ profile });
  } catch (error) {
    console.error('Get learning profile error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update user learning profile
app.put('/api/learning-profile/:courseId', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.params;
    const updates = req.body;

    // Validate allowed fields
    const allowedFields = [
      'strong_topics', 'weak_topics', 'homework_history', 'current_homework',
      'current_homework_status', 'learning_style', 'learning_pace',
      'current_topic_understanding', 'teacher_notes', 'next_lesson_recommendations',
      'subject_mastery_percentage', 'topics_completed'
    ];

    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const profile = updateUserLearningProfile(userId, courseId, filteredUpdates);
    res.json({ profile });
  } catch (error) {
    console.error('Update learning profile error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Update user profile
app.put('/api/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { learningStyle, difficultyLevel, interests, strengths, weaknesses } = req.body;

    // Ensure profile exists
    getOrCreateUserProfile(userId);

    const updates = ['updated_at = datetime("now")'];
    const values = [];

    if (learningStyle) {
      updates.push('learning_style = ?');
      values.push(learningStyle);
    }
    if (difficultyLevel) {
      updates.push('difficulty_level = ?');
      values.push(difficultyLevel);
    }
    if (interests !== undefined) {
      updates.push('interests = ?');
      values.push(interests);
    }
    if (strengths !== undefined) {
      updates.push('strengths = ?');
      values.push(strengths);
    }
    if (weaknesses !== undefined) {
      updates.push('weaknesses = ?');
      values.push(weaknesses);
    }

    values.push(userId);
    db.prepare(`UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);

    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    res.json({ profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==================== TTS API ====================

// Generate speech using OpenAI TTS
app.post('/api/tts', authenticateToken, async (req, res) => {
  try {
    console.log('🔊 === ПОСТУПИЛ ЗАПРОС НА /api/tts ===');
    console.log('TTS request received at', new Date().toISOString());

    const { text, voice = 'shimmer' } = req.body;

    if (!text || !text.trim()) {
      console.error('❌ No text provided');
      return res.status(400).json({ error: 'Текст не предоставлен' });
    }

    if (!openai) {
      console.error('OpenAI client not initialized');
      return res.status(500).json({ error: 'OpenAI API недоступен' });
    }

    console.log('Sending to OpenAI TTS...');
    console.log('Text:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));

    // Generate speech using OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice, // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text.trim(),
      response_format: "mp3",
      speed: 0.9
    });

    // Convert response to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());

    console.log('✅ TTS generated, buffer size:', buffer.length);

    // Set headers for audio response
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    // Send audio buffer
    res.send(buffer);

  } catch (error) {
    console.error('TTS error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      status: error.status
    });

    res.status(500).json({
      error: 'Ошибка при генерации речи',
      details: error.message
    });
  }
});

// ==================== VOICE TRANSCRIPTION API ====================

// Transcribe audio using OpenAI Whisper
app.post('/api/transcribe', (req, res, next) => {
  console.log('🎤 === ПОСТУПИЛ ЗАПРОС НА /api/transcribe ===');
  console.log('Headers:', req.headers.authorization ? 'Token present' : 'No token');
  console.log('Method:', req.method, 'Path:', req.path);
  next();
}, authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    console.log('🎤 === НОВЫЙ ЗАПРОС ТРАНСКРИБАЦИИ ===');
    console.log('Transcription request received at', new Date().toISOString());

    if (!req.file) {
      console.error('❌ No file provided');
      return res.status(400).json({ error: 'Аудиофайл не предоставлен' });
    }

    if (!openai) {
      console.error('OpenAI client not initialized');
      return res.status(500).json({ error: 'OpenAI API недоступен' });
    }

    console.log('Transcribing audio file:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      encoding: req.file.encoding
    });

    // Create a readable stream from the buffer
    const audioBuffer = req.file.buffer;

    console.log('Audio buffer size:', audioBuffer.length);

    // Determine correct file extension based on mimetype
    let fileExtension = '.webm';
    if (req.file.mimetype.includes('wav')) {
      fileExtension = '.wav';
    } else if (req.file.mimetype.includes('mp3') || req.file.mimetype.includes('mpeg')) {
      fileExtension = '.mp3';
    } else if (req.file.mimetype.includes('mp4') || req.file.mimetype.includes('m4a')) {
      fileExtension = '.m4a';
    } else if (req.file.mimetype.includes('ogg')) {
      fileExtension = '.ogg';
    } else if (req.file.mimetype.includes('flac')) {
      fileExtension = '.flac';
    }

    // Create filename with correct extension
    const filename = `recording${fileExtension}`;
    const cleanMimeType = req.file.mimetype.split(';')[0]; // Remove codec info from mimetype
    console.log('📁 Original mimetype:', req.file.mimetype);
    console.log('🧹 Clean mimetype:', cleanMimeType);
    console.log('📝 Using filename:', filename);

    // Create a proper File object using Node.js File API
    const { Readable } = await import('stream');
    const audioFile = new File([audioBuffer], filename, {
      type: cleanMimeType
    });
    console.log('✅ Created audio file:', audioFile.name, audioFile.size, audioFile.type);

    console.log('Sending to OpenAI Whisper...');

    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'ru', // Russian language
      response_format: 'json'
    });

    console.log('Transcription result:', transcription);

    if (!transcription.text) {
      throw new Error('Empty transcription result');
    }

    res.json({
      text: transcription.text.trim(),
      language: transcription.language || 'ru'
    });

  } catch (error) {
    console.error('Transcription error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      status: error.status
    });

    res.status(500).json({
      error: 'Ошибка при транскрибации',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not set - using fallback responses');
  }
});

