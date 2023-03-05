// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const typeList = ['created', 'collected', 'viewed', 'answered']//创建、收藏、浏览、回答
// 云函数:用户的问题(创建、收藏、浏览、回答)
exports.main = async (event, context) => {
  const collectionName = 'user-questions'
  const log = cloud.logger()
  const { OPENID, UNIONID } = cloud.getWXContext()
  const app = new TcbRouter({ event })
  const { type } = event;
  const page = event.page ? Number(event.page) : 0;
  const pageSize = event.pageSize ? Number(event.pageSize) : 10;
  // const type = event.type || 'collected'; //类型
  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  // 查询接口
  app.router('get', async (ctx, next) => {
    try {

      if (typeList.indexOf(type) == -1) {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
      } else {
        // 先看有没有缓存
        const data = await db.collection(collectionName).where({ 
          // user_openid: OPENID, 
          user_unionid: UNIONID 
        }).get();
        ctx.body = {
          code: 0,
          data: data
        }

      }




    } catch (error) {
      log.log(error)
      ctx.body = {
        code: 1,
        msg: '读取失败',
        // data: error
      }
    }
  })
  return app.serve();
}