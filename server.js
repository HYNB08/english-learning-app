const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-frontend-domain.vercel.app'],
  credentials: true
}));
app.use(express.json());

// 连接数据库
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/english-app';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ 数据库连接成功'))
  .catch(err => console.error('❌ 数据库连接失败:', err));

// 用户模型
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  level: { type: String, default: '初级' },
  wordsLearned: { type: Number, default: 0 },
  weeksStreak: { type: Number, default: 0 },
  dailyMinutes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// 学习记录模型
const StudyRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  exerciseType: { type: String, required: true },
  unit: { type: String, required: true },
  isCorrect: { type: Boolean, required: true },
  timeSpent: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const StudyRecord = mongoose.model('StudyRecord', StudyRecordSchema);

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
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const user = new User({
      username,
      email,
      password: hashedPassword,
      name: name || username
    });
    
    await user.save();
    
    // 生成JWT Token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
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
    const user = await User.findOne({
      $or: [{ email: username }, { username }]
    });
    
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '密码错误' });
    }
    
    // 生成JWT Token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
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
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({ success: true, user });
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
    const record = new StudyRecord({
      userId: req.user.userId,
      exerciseType,
      unit,
      isCorrect,
      timeSpent: timeSpent || 0
    });
    
    await record.save();
    
    // 更新用户统计
    if (isCorrect) {
      await User.findByIdAndUpdate(req.user.userId, {
        $inc: { wordsLearned: 1 }
      });
    }
    
    res.json({ success: true, record });
  } catch (error) {
    console.error('保存学习记录错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取学习记录API
app.get('/api/study-records', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    const records = await StudyRecord.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await StudyRecord.countDocuments({ userId: req.user.userId });
    
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
    const totalExercises = await StudyRecord.countDocuments({ userId });
    
    // 获取正确练习数
    const correctExercises = await StudyRecord.countDocuments({ userId, isCorrect: true });
    
    // 获取各类型练习统计
    const exerciseStats = await StudyRecord.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$exerciseType',
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } }
        }
      }
    ]);
    
    // 获取各单元统计
    const unitStats = await StudyRecord.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: { exerciseType: '$exerciseType', unit: '$unit' },
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } }
        }
      }
    ]);
    
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`📡 API地址: http://localhost:${PORT}`);
  console.log(`📚 文档地址: http://localhost:${PORT}/`);
});
