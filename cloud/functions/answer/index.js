// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const collection = 'answer' //数据库的名称
  const app = new TcbRouter({ event })
  const { questionId } = event
  const { OPENID, UNIONID } = cloud.getWXContext()

  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  // 1.today 用户对该问题今天的回答 (redis24小时过期)
  app.router('today', async (ctx, next) => {
    const data = await db.collection(collection).where({ user_openid: OPENID, user_unionid: UNIONID, quesion_id: questionId }).get()
    ctx.body = { code:0,data }
  })

  // 2.add 添加用户对该问题今天的回答
  // 集合question的total_answers字段增1

  // 3.update 修改用户对该问题今天的回答(redis24小时过期)

  // 4.history 用户对该问题的过往的回答(redis24小时过期)


  return app.serve();
}