const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'english_app',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
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

// 验证JWT Token
const authenticateToken = (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (err) {
    return null;
  }
};

// 主处理函数
export default async function handler(req, res) {
  // 设置CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://english-app-frontend-ruby.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method, url } = req;

  try {
    // 根路径
    if (method === 'GET' && url === '/') {
      return res.status(200).json({
        message: '英语学习应用API服务器',
        version: '1.0.0',
        status: '运行中'
      });
    }

    // 注册API
    if (method === 'POST' && url === '/api/register') {
      await initDatabase();
      
      const { username, email, password, name } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ error: '用户名、邮箱和密码不能为空' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少6位' });
      }

      const [existingUsers] = await pool.execute(
        'SELECT * FROM users WHERE email = ? OR username = ?',
        [email, username]
      );
      
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: '用户名或邮箱已存在' });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const [result] = await pool.execute(
        'INSERT INTO users (username, email, password, name) VALUES (?, ?, ?, ?)',
        [username, email, hashedPassword, name || username]
      );
      
      const token = jwt.sign({ userId: result.insertId }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
      
      return res.status(200).json({
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
    }

    // 登录API
    if (method === 'POST' && url === '/api/login') {
      await initDatabase();
      
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }
      
      const [users] = await pool.execute(
        'SELECT * FROM users WHERE email = ? OR username = ?',
        [username, username]
      );
      
      if (users.length === 0) {
        return res.status(401).json({ error: '用户不存在' });
      }
      
      const user = users[0];
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: '密码错误' });
      }
      
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
      
      return res.status(200).json({
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
    }

    // 获取用户信息API
    if (method === 'GET' && url === '/api/user') {
      const user = authenticateToken(req);
      if (!user) {
        return res.status(401).json({ error: '需要登录Token' });
      }

      const [users] = await pool.execute(
        'SELECT id, username, email, name, level, wordsLearned, weeksStreak, dailyMinutes FROM users WHERE id = ?',
        [user.userId]
      );
      
      if (users.length === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }
      
      return res.status(200).json({ success: true, user: users[0] });
    }

    // 保存学习记录API
    if (method === 'POST' && url === '/api/study-record') {
      const user = authenticateToken(req);
      if (!user) {
        return res.status(401).json({ error: '需要登录Token' });
      }

      const { exerciseType, unit, isCorrect, timeSpent } = req.body;
      
      if (!exerciseType || !unit || typeof isCorrect !== 'boolean') {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      
      const [result] = await pool.execute(
        'INSERT INTO study_records (userId, exerciseType, unit, isCorrect, timeSpent) VALUES (?, ?, ?, ?, ?)',
        [user.userId, exerciseType, unit, isCorrect, timeSpent || 0]
      );
      
      if (isCorrect) {
        await pool.execute(
          'UPDATE users SET wordsLearned = wordsLearned + 1 WHERE id = ?',
          [user.userId]
        );
      }
      
      return res.status(200).json({ success: true, record: { id: result.insertId, ...req.body } });
    }

    // 获取学习记录API
    if (method === 'GET' && url === '/api/study-records') {
      const user = authenticateToken(req);
      if (!user) {
        return res.status(401).json({ error: '需要登录Token' });
      }

      const { limit = 50, page = 1 } = req.query;
      const offset = (page - 1) * limit;
      
      const [records] = await pool.execute(
        'SELECT * FROM study_records WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?',
        [user.userId, parseInt(limit), offset]
      );
      
      const [totalResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM study_records WHERE userId = ?',
        [user.userId]
      );
      
      const total = totalResult[0].total;
      
      return res.status(200).json({ 
        success: true, 
        records, 
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    }

    // 获取学习统计API
    if (method === 'GET' && url === '/api/stats') {
      const user = authenticateToken(req);
      if (!user) {
        return res.status(401).json({ error: '需要登录Token' });
      }

      const userId = user.userId;
      
      const [totalResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM study_records WHERE userId = ?',
        [userId]
      );
      const totalExercises = totalResult[0].total;
      
      const [correctResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM study_records WHERE userId = ? AND isCorrect = 1',
        [userId]
      );
      const correctExercises = correctResult[0].total;
      
      const [exerciseStats] = await pool.execute(`
        SELECT exerciseType, 
               COUNT(*) as total, 
               SUM(CASE WHEN isCorrect = 1 THEN 1 ELSE 0 END) as correct
        FROM study_records 
        WHERE userId = ? 
        GROUP BY exerciseType
      `, [userId]);
      
      const [unitStats] = await pool.execute(`
        SELECT exerciseType, unit,
               COUNT(*) as total, 
               SUM(CASE WHEN isCorrect = 1 THEN 1 ELSE 0 END) as correct
        FROM study_records 
        WHERE userId = ? 
        GROUP BY exerciseType, unit
      `, [userId]);
      
      return res.status(200).json({
        success: true,
        stats: {
          totalExercises,
          correctExercises,
          accuracy: totalExercises > 0 ? (correctExercises / totalExercises * 100).toFixed(2) : 0,
          exerciseStats,
          unitStats
        }
      });
    }

    // 404处理
    return res.status(404).json({ error: 'API接口不存在' });

  } catch (error) {
    console.error('API错误:', error);
    return res.status(500).json({ error: '服务器错误' });
  }
}
