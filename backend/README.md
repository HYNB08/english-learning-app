# 英语学习应用后端

## 部署到 Railway

1. 访问 https://railway.app
2. 连接GitHub账号
3. 导入此仓库
4. 选择 `backend` 文件夹
5. 设置环境变量：
   - `MONGODB_URI`: MongoDB Atlas连接字符串
   - `JWT_SECRET`: JWT密钥
   - `PORT`: 3000
6. 自动部署

## API接口

### 用户认证
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `GET /api/user` - 获取用户信息

### 学习记录
- `POST /api/study-record` - 保存学习记录
- `GET /api/study-records` - 获取学习记录
- `GET /api/stats` - 获取学习统计

## 技术栈
- Node.js + Express
- MongoDB + Mongoose
- JWT认证
- bcryptjs密码加密
