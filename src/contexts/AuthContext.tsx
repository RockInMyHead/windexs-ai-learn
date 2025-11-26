import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; email?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = 'https://teacher.windexs.ru/api';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchUser(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUser = async (authToken: string) => {
    try {
      const response = await fetch(`${API_URL}/profile`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch (error) {
          console.error('Failed to parse profile response:', error);
          // Если не можем получить профиль, оставляем базового пользователя
          setIsLoading(false);
          return;
        }
        setUser(data.profile);
      } else {
        console.error('Failed to fetch user profile:', response.status, response.statusText);
        // Если не можем получить профиль, оставляем базового пользователя
        // localStorage.removeItem('token'); // Не удаляем токен при ошибке профиля
        // setToken(null);
        // setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // При сетевой ошибке тоже оставляем базового пользователя
      // localStorage.removeItem('token');
      // setToken(null);
      // setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error('Failed to parse login response:', error);
      throw new Error('Ошибка сервера: неправильный ответ');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка входа');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user); // Сначала устанавливаем базовую информацию о пользователе
    // После небольшой задержки получаем полный профиль
    setTimeout(() => fetchUser(data.token), 500);
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, name })
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error('Failed to parse registration response:', error);
      throw new Error('Ошибка сервера: неправильный ответ');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка регистрации');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user); // Сначала устанавливаем базовую информацию о пользователе
    // После небольшой задержки получаем полный профиль
    setTimeout(() => fetchUser(data.token), 500);
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (data: { name?: string; email?: string }) => {
    if (!token) throw new Error('Не авторизован');

    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Ошибка обновления профиля');
    }

    setUser(result.user);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!token) throw new Error('Не авторизован');

    const response = await fetch(`${API_URL}/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Ошибка изменения пароля');
    }
  };

  const deleteAccount = async () => {
    if (!token) throw new Error('Не авторизован');

    const response = await fetch(`${API_URL}/auth/account`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Ошибка удаления аккаунта');
    }

    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
        deleteAccount
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

