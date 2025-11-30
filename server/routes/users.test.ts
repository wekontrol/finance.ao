import express from 'express';
import session from 'express-session';
import request from 'supertest';
import usersRouter from './users';
import db from '../db/schema';
import bcrypt from 'bcryptjs';

const app = express();
app.use(express.json());
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: true,
}));
app.use('/users', usersRouter);

// Mock the database
jest.mock('../db/schema', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      password TEXT,
      name TEXT,
      role TEXT,
      avatar TEXT,
      status TEXT,
      created_by TEXT,
      family_id TEXT,
      birth_date TEXT,
      allow_parent_view INTEGER
    );
    CREATE TABLE budget_limits (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      category TEXT,
      limit_amount REAL,
      is_default INTEGER
    );
  `);
  return db;
});

describe('DELETE /users/:id', () => {
  let managerUser: any;
  let memberUser: any;

  beforeEach(() => {
    // Clear the database before each test
    db.exec('DELETE FROM users');
    db.exec('DELETE FROM budget_limits');

    // Create a manager and a member user for testing
    const managerId = 'manager1';
    const memberId = 'member1';
    const familyId = 'family1';

    const managerPassword = bcrypt.hashSync('password', 10);
    const memberPassword = bcrypt.hashSync('password', 10);

    db.prepare(`
      INSERT INTO users (id, username, password, name, role, family_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(managerId, 'manager', managerPassword, 'Manager User', 'MANAGER', familyId);

    db.prepare(`
      INSERT INTO users (id, username, password, name, role, family_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(memberId, 'member', memberPassword, 'Member User', 'MEMBER', familyId);

    // Create budget limits for the member user
    db.prepare(`
      INSERT INTO budget_limits (id, user_id, category, limit_amount)
      VALUES (?, ?, ?, ?)
    `).run('budget1', memberId, 'Food', 100);

    managerUser = { id: managerId, role: 'MANAGER', familyId };
    memberUser = { id: memberId, role: 'MEMBER', familyId };
  });

  it('should delete a user and their budget limits', async () => {
    const agent = request.agent(app);

    // Manually set the session for the manager user
    await agent.post('/mock-login').send({ userId: managerUser.id, user: managerUser });

    const response = await agent.delete(`/users/${memberUser.id}`);
    expect(response.status).toBe(200);

    // Check that the user was deleted
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(memberUser.id);
    expect(user).toBeUndefined();

    // Check that the user's budget limits were also deleted
    const budgetLimits = db.prepare('SELECT * FROM budget_limits WHERE user_id = ?').all(memberUser.id);
    expect(budgetLimits.length).toBe(0);
  });
});

// Helper route to mock login
app.post('/mock-login', (req, res) => {
    // @ts-ignore
  req.session.userId = req.body.userId;
    // @ts-ignore
  req.session.user = req.body.user;
  res.sendStatus(200);
});

describe('POST /users', () => {
  let superAdminUser: any;

  beforeEach(() => {
    db.exec('DELETE FROM users');
    db.exec('DELETE FROM budget_limits');

    const superAdminId = 'superadmin1';
    const familyId = 'family1';
    const superAdminPassword = bcrypt.hashSync('password', 10);

    db.prepare(`
      INSERT INTO users (id, username, password, name, role, family_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(superAdminId, 'superadmin', superAdminPassword, 'Super Admin', 'SUPER_ADMIN', familyId);

    superAdminUser = { id: superAdminId, role: 'SUPER_ADMIN', familyId };
  });

  it('should allow a SUPER_ADMIN to create a user in a different family', async () => {
    const agent = request.agent(app);
    await agent.post('/mock-login').send({ userId: superAdminUser.id, user: superAdminUser });

    const newUser = {
      username: 'newuser',
      password: 'password',
      name: 'New User',
      role: 'MEMBER',
      familyId: 'family2',
    };

    const response = await agent.post('/users').send(newUser);
    expect(response.status).toBe(201);
    expect(response.body.familyId).toBe('family2');

    const createdUser = db.prepare('SELECT * FROM users WHERE username = ?').get(newUser.username) as any;
    expect(createdUser.family_id).toBe('family2');
  });
});
