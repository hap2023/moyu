// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
// 用户信息
exports.main = async (event, context) => {

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

      const { data } = await db.collection('user')
        .where({
          // openid: OPENID, 
          unionid: UNIONID
        }).get();
      if (data && data.length) {
        // 返回用户信息
        ctx.body = { code: 0, data: data[0] }
      } else {
        // const administrator = process.env.ADMIN.split('|');//管理员列表
        // const role = administrator.indexOf(OPENID) == -1 ? "user" : 'admin';//角色：管理员/用户
        const now = Date.now()
        const newUser = {
          avatar_url: "",
          // create_time: db.serverDate(),
          create_time: now,
          first_login_from: 'wechat',
          last_login_from: 'wechat',
          last_login_time: now,
          nick_name: "",
          openid: OPENID,
          role: 'user',
          unionid: UNIONID,
        }

        // 创建用户
        const result = await db.collection('user').add({
          data: newUser
        });
        // 返回用户信息
        ctx.body = { code: 0, msg: '创建新用户成功', data: result }
      }
    } catch (error) {
      ctx.body = { code: 1, msg: '读取用户信息失败', data: error }
    }
  })

  return app.serve();
}