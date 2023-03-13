// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数:用户的问题(创建、收藏、回答)
exports.main = async (event, context) => {
  const log = cloud.logger()
  const { OPENID, UNIONID } = cloud.getWXContext()
  const app = new TcbRouter({ event })
  // const { type} = event;
  const page = event.page || 0;
  const pageSize = event.pageSize || 10;
  const collectionType = event.type || 'user-collected'; //集合
  const collection = db.collection(collectionType)

  // log.log(collection)
  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  // 查询接口
  app.router('list', async (ctx, next) => {
    try {


      const data = await collection
        .aggregate()
        .match({
          user_unionid: UNIONID,
        })
        .lookup({
          from: 'question',
          let: {
            question_id: '$question_id',
          },
          pipeline: $.pipeline()
            .match(_.expr($.and([
              $.eq(['$_id', '$$question_id']),
              // $.eq(['$status', 'reviewing']),
            ])))
            .project({
              title: 1,
              answer_counts: 1,
              status: 1
            })
            .done(),
          as: 'questionList',
        })
        .addFields({
          question: $.mergeObjects([$.arrayElemAt(['$questionList', 0]),]),
        })
        .match({
          'question.status': 'open',//审核中
        })
        .project({
          questionList: 0,
        })
        .skip(pageSize * page).limit(pageSize)
        .end()

      ctx.body = {
        code: 0,
        data: data.list
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