// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const TcbRouter = require('../user-questions/node_modules/tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数:用户回答过的问题
exports.main = async (event, context) => {
  const { OPENID, UNIONID } = cloud.getWXContext()
  const collection = 'user-answered' //数据库
  const app = new TcbRouter({ event })
  const { } = event
  const page = event.page || 0;
  const pageSize = event.pageSize || 10;


  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  app.router('get', async (ctx, next) => {
    try {
      const data = await db.collection(collection)
        .aggregate()
        .match({
          user_unionid: UNIONID,
        })
        .lookup({
          from: 'question',
          pipeline: $.pipeline()
            .match({
              isClosed: false,
              isApproved: true
            })
            .project({
              title: 1,
              answer_counts: 1
            })
            .done(),
          as: 'questions',
        })
        .skip(pageSize * page).limit(pageSize)
        .end()

      ctx.body = {
        code: 0,
        data: data.list
      }
    } catch (error) {

      ctx.body = {
        code: 1,
        msg: '读取用户回答过的问题失败',
        data: error
      }

    }
  })

  return app.serve();
}