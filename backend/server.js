const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: ['http://localhost:3000', 'https://english-app-frontend-ruby.vercel.app'],
  credentials: true
}));
app.use(express.json());

// 创建数据库连接池（适配 Vercel）
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'english_app',
  waitForConnections: true,
  connectionLimit: 5, // Vercel 限制连接数
  queueLimit: 0,
  acquireTimeout: 60000, // 60秒超时
  timeout: 60000, // 60秒超时
  reconnect: true
});

// 初始化数据库表
async function initDatabase() {
  try {
    // 创建用户表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        level VARCHAR(50) DEFAULT '初级',
        wordsLearned INT DEFAULT 0,
        weeksStreak INT DEFAULT 0,
        dailyMinutes INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建学习记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS study_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        exerciseType VARCHAR(100) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        isCorrect BOOLEAN NOT NULL,
        timeSpent INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ 数据库表初始化成功');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
  }
}

// 初始化数据库
initDatabase();

// 中间件：验证JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '需要登录Token' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token无效' });
    }
    req.user = user;
    next();
  });
};

// 根路径
app.get('/', (req, res) => {
  res.json({ 
    message: '英语学习应用API服务器', 
    version: '1.0.0',
    status: '运行中'
  });
});

// 注册API
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, name } = req.body;
    
    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码不能为空' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 检查用户是否已存在
    const [existingUsers] = await pool.execute(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password, name) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, name || username]
    );
    
    // 生成JWT Token
    const token = jwt.sign({ userId: result.insertId }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: result.insertId,
        username,
        email,
        name: name || username,
        level: '初级',
        wordsLearned: 0,
        weeksStreak: 0,
        dailyMinutes: 0
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录API
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    // 查找用户（支持用户名或邮箱登录）
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [username, username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }
    
    const user = users[0];
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '密码错误' });
    }
    
    // 生成JWT Token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        level: user.level,
        wordsLearned: user.wordsLearned,
        weeksStreak: user.weeksStreak,
        dailyMinutes: user.dailyMinutes
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户信息API
app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, name, level, wordsLearned, weeksStreak, dailyMinutes FROM users WHERE id = ?',
      [req.user.userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ success: true, user: users[0] });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 保存学习记录API
app.post('/api/study-record', authenticateToken, async (req, res) => {
  try {
    const { exerciseType, unit, isCorrect, timeSpent } = req.body;
    
    if (!exerciseType || !unit || typeof isCorrect !== 'boolean') {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 保存学习记录
    const [result] = await pool.execute(
      'INSERT INTO study_records (userId, exerciseType, unit, isCorrect, timeSpent) VALUES (?, ?, ?, ?, ?)',
      [req.user.userId, exerciseType, unit, isCorrect, timeSpent || 0]
    );
    
    // 更新用户统计
    if (isCorrect) {
      await pool.execute(
        'UPDATE users SET wordsLearned = wordsLearned + 1 WHERE id = ?',
        [req.user.userId]
      );
    }
    
    res.json({ success: true, record: { id: result.insertId, ...req.body } });
  } catch (error) {
    console.error('保存学习记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取学习记录API
app.get('/api/study-records', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    const [records] = await pool.execute(
      'SELECT * FROM study_records WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?',
      [req.user.userId, parseInt(limit), offset]
    );
    
    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM study_records WHERE userId = ?',
      [req.user.userId]
    );
    
    const total = totalResult[0].total;
    
    res.json({ 
      success: true, 
      records, 
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('获取学习记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取学习统计API
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // 获取总练习数
    const [totalResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM study_records WHERE userId = ?',
      [userId]
    );
    const totalExercises = totalResult[0].total;
    
    // 获取正确练习数
    const [correctResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM study_records WHERE userId = ? AND isCorrect = 1',
      [userId]
    );
    const correctExercises = correctResult[0].total;
    
    // 获取各类型练习统计
    const [exerciseStats] = await pool.execute(`
      SELECT exerciseType, 
             COUNT(*) as total, 
             SUM(CASE WHEN isCorrect = 1 THEN 1 ELSE 0 END) as correct
      FROM study_records 
      WHERE userId = ? 
      GROUP BY exerciseType
    `, [userId]);
    
    // 获取各单元统计
    const [unitStats] = await pool.execute(`
      SELECT exerciseType, unit,
             COUNT(*) as total, 
             SUM(CASE WHEN isCorrect = 1 THEN 1 ELSE 0 END) as correct
      FROM study_records 
      WHERE userId = ? 
      GROUP BY exerciseType, unit
    `, [userId]);
    
    res.json({
      success: true,
      stats: {
        totalExercises,
        correctExercises,
        accuracy: totalExercises > 0 ? (correctExercises / totalExercises * 100).toFixed(2) : 0,
        exerciseStats,
        unitStats
      }
    });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ error: 'API接口不存在' });
});

// 启动服务器（适配 Vercel）
if (process.env.NODE_ENV === 'production') {
  // Vercel 环境
  module.exports = app;
} else {
  // 本地开发环境
  app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`📡 API地址: http://localhost:${PORT}`);
    console.log(`📚 文档地址: http://localhost:${PORT}/`);
  });
}
