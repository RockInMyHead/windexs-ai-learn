import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './database.js';

async function createTestUser() {
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create user
    const userId = uuidv4();
    db.prepare('INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)').run(
      userId,
      'fsdfdss@mail.ru',
      hashedPassword,
      'Test User'
    );

    console.log('✅ Test user created successfully!');
    console.log('Email: fsdfdss@mail.ru');
    console.log('Password: password123');
    console.log('User ID:', userId);

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  }
}

createTestUser();
