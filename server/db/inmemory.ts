// In-memory user storage for development mode
import bcrypt from 'bcryptjs';

export const memoryUsers = [
  {
    id: 'u0',
    username: 'admin',
    password: bcrypt.hashSync('admin', 10),
    name: 'Super Admin',
    role: 'SUPER_ADMIN',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Super',
    status: 'APPROVED',
    family_id: 'fam_admin',
    created_by: null,
    birth_date: null,
    allow_parent_view: false,
  }
];

export function findUserByUsername(username: string) {
  return memoryUsers.find(u => u.username === username);
}

export function addUser(user: any) {
  memoryUsers.push(user);
}
