// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const cacheUtil = require('/opt/utils/cache.js') //redis 使用到了云函数的层管理
const dateUtil = require('/opt/utils/dateUtil.js') //时间相关的方法 使用到了云函数的层管理
// 用户信息
exports.main = async (event, context) => {
  const logger = cloud.logger()
  const app = new TcbRouter({ event })
  // const { } = event
  const { OPENID, UNIONID } = cloud.getWXContext()


  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });



  // 1.用户详情info 
  app.router('info', async (ctx, next) => {
    try {

      const now = Date.now()
      const cacheKey = `user:${UNIONID}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);//key是否存在
      if (cacheKeyExists) {
        const cacheData = await cacheUtil.redis.hgetall(cacheKey)
        ctx.body = { code: 0, data: cacheData, msg: '成功返回缓存的用户信息' }
      } else {
        const { data } = await db.collection('user')
          .where({
            // openid: OPENID, 
            unionid: UNIONID
          }).get();
        if (data && data.length) {
          // 返回用户信息
          ctx.body = { code: 0, data: data[0], }
          // 缓存用户信息
          await cacheUtil.redis.hset(cacheKey, data[0]);
        } else {

          // const administrator = process.env.ADMIN.split('|');//管理员列表
          // const role = administrator.indexOf(OPENID) == -1 ? "user" : 'admin';//角色：管理员/用户

          const newUser = {
            avatar_url: "",
            // create_time: db.serverDate(),
            create_time: now,
            first_login_from: 'wechat',
            // last_login_from: 'wechat',
            // last_login_time: now,
            nick_name: "",
            openid: OPENID,
            unionid: UNIONID,
            role: 'user',
          }

          // 创建用户表user
          const result = await db.collection('user').add({
            data: newUser
          });

          // 返回用户信息
          ctx.body = { code: 0, msg: '创建新用户成功', data: newUser }
          // 缓存用户信息
          await cacheUtil.redis.hset(cacheKey, newUser);

        }
      }

      //TODO:使用缓存 再创建用户问题表user-questions
      const userQuestions = await db.collection('user-questions').where({
        user_unionid: UNIONID,
      }).get();

      if (userQuestions.data.length == 0) {
        const result2 = await db.collection('user-questions').add({
          data: {
            create_time: now,
            user_unionid: UNIONID,
            user_openid: OPENID,
            answered_questions: [],
            collected_questions: [],
            created_questions: [],
            viewed_questions: []
          }
        });
      }

      // await cacheUtil.redis.quit();
    } catch (error) {
      ctx.body = { code: 1, msg: '读取用户信息失败', data: error }
      logger.error({
        type: error.name,
        message: error.message,
      });
    }

  })

  return app.serve();
}