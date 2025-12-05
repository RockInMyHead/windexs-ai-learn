import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create sessions table for token management
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create user_courses table for tracking enrolled courses
db.exec(`
  CREATE TABLE IF NOT EXISTS user_courses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    grade TEXT,
    goal TEXT,
    goal_name TEXT,
    icon TEXT,
    progress INTEGER DEFAULT 0,
    next_lesson TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, subject_id, grade, goal)
  )
`);

// Create chat_messages table for storing conversation history
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text', 'voice', 'file')),
    file_url TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create homework table for tracking assignments
db.exec(`
  CREATE TABLE IF NOT EXISTS homework (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'submitted', 'checked', 'completed')),
    score INTEGER,
    feedback TEXT,
    due_date DATETIME,
    submitted_at DATETIME,
    checked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create user_profiles table for personalization
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    learning_style TEXT DEFAULT 'visual' CHECK(learning_style IN ('visual', 'auditory', 'kinesthetic', 'reading')),
    difficulty_level TEXT DEFAULT 'medium' CHECK(difficulty_level IN ('easy', 'medium', 'hard')),
    preferred_language TEXT DEFAULT 'ru',
    interests TEXT,
    strengths TEXT,
    weaknesses TEXT,
    total_study_time INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    average_session_length INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create learning_analytics table for tracking progress
db.exec(`
  CREATE TABLE IF NOT EXISTS learning_analytics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    session_date DATE NOT NULL,
    messages_count INTEGER DEFAULT 0,
    study_duration INTEGER DEFAULT 0,
    topics_covered TEXT,
    performance_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create user_learning_profiles table for detailed course-specific learning profiles
db.exec(`
  CREATE TABLE IF NOT EXISTS user_learning_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    strong_topics TEXT,
    weak_topics TEXT,
    homework_history TEXT,
    current_homework TEXT,
    current_homework_status TEXT,
    learning_style TEXT,
    learning_pace TEXT,
    current_topic_understanding INTEGER,
    teacher_notes TEXT,
    next_lesson_recommendations TEXT,
    subject_mastery_percentage REAL,
    topics_completed INTEGER,
    last_activity_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, course_id)
  )
`);

// Create user_personality_profiles table for AI-generated user insights
db.exec(`
  CREATE TABLE IF NOT EXISTS user_personality_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    personality_summary TEXT,
    communication_style TEXT,
    interests_hobbies TEXT,
    goals_aspirations TEXT,
    challenges_concerns TEXT,
    preferred_examples TEXT,
    background_context TEXT,
    key_memories TEXT,
    teaching_preferences TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Course performance per lesson
db.exec(`
  CREATE TABLE IF NOT EXISTS course_performance (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    grade INTEGER NOT NULL CHECK(grade >= 2 AND grade <= 5),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_course_performance_user ON course_performance(user_id);
  CREATE INDEX IF NOT EXISTS idx_course_performance_course ON course_performance(course_id);
`);

// Create subscriptions table for payment plans
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    yookassa_payment_id TEXT,
    started_at INTEGER NOT NULL,
    expires_at INTEGER,
    auto_renew INTEGER NOT NULL DEFAULT 1,
    lessons_limit INTEGER,
    lessons_used INTEGER DEFAULT 0,
    voice_sessions_limit INTEGER,
    voice_sessions_used INTEGER DEFAULT 0,
    free_lessons_remaining INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create payments log table
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    yookassa_id TEXT UNIQUE,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    status TEXT NOT NULL,
    plan TEXT,
    description TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create indexes for payment tables
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
  CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_yookassa_id ON payments(yookassa_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
`);

export default db;

