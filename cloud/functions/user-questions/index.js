// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const cacheUtil = require('/opt/utils/cache.js') //redis 使用到了云函数的层管理
const dateUtil = require('/opt/utils/dateUtil.js') //时间相关的方法 使用到了云函数的层管理

const typeList = ['created', 'collected', 'answered',]//创建、收藏、回答、浏览(废弃)

// 云函数:用户行为相关的问题(创建、收藏、回答)
exports.main = async (event, context) => {
  const logger = cloud.logger()
  const app = new TcbRouter({ event })
  const collectionName = 'user-questions'

  const { OPENID, UNIONID } = cloud.getWXContext()
  const { type } = event;
  const page = event.page ? Number(event.page) : 0;
  const pageSize = event.pageSize ? Number(event.pageSize) : 10;
  const skip = page * pageSize
  // const type = event.type || 'collected'; //类型
  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  //1. 查询相关行为的问题ID列表(创建、收藏、回答)
  app.router('list', async (ctx, next) => {
    try {

      if (typeList.indexOf(type) == -1) {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
        return;
      }

      // 先看有没有问题ID列表的缓存
      const cacheKey = `user-questions:${type}:${UNIONID}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);
      const cacheData = await cacheUtil.redis.lrange(cacheKey, 0, -1);
      if (cacheKeyExists && cacheData.length == 1 && cacheData[0] == 'EMPTY') {
        // 缓存列表为空
        ctx.body = { code: 0, cacheKey, msg: `${type}缓存结果空`, data: [] }
      } else {
        let flag = "";
        // 缓存的问题ID列表不为空或者没有问题ID列表的缓存
        let questions = null;
        if (cacheKeyExists && cacheData[0] != 'EMPTY') {
          // 问题ID列表取自缓存
          console.log("问题ID列表取自缓存");
          flag = "cache";
          questions = cacheData
        } else {
          // 问题ID列表取自数据库
          console.log("问题ID列表取自数据库");
          flag = "database"
          const { data } = await db.collection(collectionName).where({
            // user_openid: OPENID, 
            user_unionid: UNIONID
          }).get();
          questions = data[0] ? data[0][`${type}_questions`] : []
        }
        // 问题ID列表的长度
        const questionLength = questions ? questions.length : 0
        console.log(questions);
        if (questions && questionLength) {
          // user-questions有该用户的记录。并且记录里对应的[type]_questions字段数组有记录
          let result = []
          // 分页取出问题的详情(只取pageSize条数据即可)
          for (let index = skip; index < questionLength; index++) {
            if (result.length >= pageSize) {
              // 结束循环，只取pageSize条数据即可
              break;
            }
            const { question_id: questionId } = flag == 'cache' ? JSON.parse(questions[index]) : questions[index];
            // 先看该问题详情是否有缓存
            const cacheQuestionKey = `question:detail:${questionId}:detail`
            const cacheQuestion = await cacheUtil.redis.hgetall(cacheQuestionKey);
            console.log("该问题详情是否有缓存", questionId, cacheQuestion);
            if (cacheQuestion) {
              if ((type == 'answered' || type == 'collected') && cacheQuestion.status != 'open') {
                // 收藏过的和回答过的只记录公开状态的问题
                console.log("收藏过的和回答过的只记录公开状态的问题", cacheQuestion);
                result.push(cacheQuestion)
              } else {
                result.push(cacheQuestion)
              }

            } else {
              // 调用另一个云函数获取问题的详情

              const questionData = await cloud.callFunction({
                name: 'question',
                data: {
                  $url: 'detail',
                  questionId: questionId,
                  // status: 'open',
                }
              })
              console.log('调用另一个云函数获取问题的详情');
              console.log(questionData);
              result.push(questionData.data);
            }

            // 缓存问题ID列表
            if (flag == 'database') {
              const element = JSON.stringify(questions[index]);
              cacheUtil.redis.rpush(cacheKey, element);
            }

          }

          ctx.body = {
            code: 0,
            msg: `读取${type}列表成功`,
            length: questionLength,
            data: result
          }


        } else {
          ctx.body = {
            code: 0,
            msg: '没有数据',
            data: [],
          }
          // 问题ID列表为空时，设置缓存值为只包含特殊字符串'EMPTY'的数组
          await cacheUtil.redis.rpush(cacheKey, 'EMPTY', () => {
            // cacheUtil.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
          })
        }
      }


    } catch (error) {

      ctx.body = {
        code: 1,
        msg: '读取失败',
        data: error
      }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
      });
    }
    // await cacheUtil.redis.quit();
  })


  // TODO:add 添加相关行为的问题ID列表(创建、收藏、回答)
  app.router('add', async (ctx, next) => {
    try {
      if (typeList.indexOf(type) == -1) {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
        return;
      }
      const { questionId } = event
      const date = dateUtil.formatTime(new Date());////当前年-月-日
      const now = Date.now();//当前时间戳



    } catch (error) {
      ctx.body = { code: 1, msg: '添加问题ID列表失败', data: error }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
      });
    }
    // await cacheUtil.redis.quit();
  })

  // TODO:移除相关行为的问题ID列表
  app.router('remove', async (ctx, next) => {
    try {
      // (只有取消收藏, 创建过的和回答过的问题记录都不能删除)
      if (type != 'collect') {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
        return;
      }
      const { questionId } = event
      const date = dateUtil.formatTime(new Date());////当前年-月-日
      const now = Date.now();//当前时间戳



    } catch (error) {
      ctx.body = { code: 1, msg: '取消收藏失败', data: error }
    }
    // await cacheUtil.redis.quit();
  })

  // TODO:isActioned (是否已收藏、回答过、创建的)
  app.router('isActioned', async (ctx, next) => {
    try {
      if (typeList.indexOf(type) == -1) {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
        return;
      }
      const { questionId } = event
      const date = dateUtil.formatTime(new Date());////当前年-月-日
      const now = Date.now();//当前时间戳



    } catch (error) {
      ctx.body = { code: 1, msg: '取消收藏失败', data: error }
    }
    // await cacheUtil.redis.quit();
  })

  return app.serve();
}