// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
// 云函数入口函数
exports.main = async (event, context) => {
  const collection = 'user' //用户信息数据库的名称

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

      const data = await db.collection(collection).where({ 
        // openid: OPENID, 
        unionid: UNIONID 
      }).get();
      if (data.length) {
        // 返回用户信息
        ctx.body = { code:0,data:data[0] }
      } else {
        const administrator = process.env.ADMIN.split('|');//管理员列表
        const role = administrator.indexOf(OPENID) == -1 ? "user" : 'admin';//角色：管理员/用户
        const now = Date.now()
        // 创建用户
        const result = await db.collection(userCollection).add({
          data: {
            avatar_url: "",
            create_time: now,
            first_login_from: 'wechat',
            nick_name: "",
            openid: OPENID,
            role,
            unionid: UNIONID,
          }
        });
         // 返回用户信息
        ctx.body = { code:0,data:result[0] }
      }
    } catch (error) {
      return {code:1,msg:'读取用户信息失败',data:err}
    }


  })


  // 2.用户收藏过的问题user-collected
  app.router('collected', async (ctx, next) => {
    try {

      const data = await db.collection(userCCollection).where({ 
        // user_openid: OPENID, 
        user_unionid: UNIONID ,

      }).get();
      ctx.body = { code:0,data }
    } catch (error) {
      return {code:1,msg:'读取用户收藏问题失败',data:err}
    }
  })



  // 4.用户创建过的问题user-created
  app.router('created', async (ctx, next) => {
    try {

      const data = await db.collection(userCreatedCollection).where({ 
        // user_openid: OPENID, 
        user_unionid: UNIONID ,

      }).get();
      ctx.body = { code:0,data }
    } catch (error) {
      return {code:1,msg:'读取用户创建过的问题失败',data:err}
    }
  })


  return app.serve();
}