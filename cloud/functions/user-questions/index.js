// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
// const Redis = require('ioredis')
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


  const { OPENID, UNIONID } = cloud.getWXContext()


  // const type = event.type || 'collected'; //类型
  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  //1. 查询相关行为的问题ID列表(创建、收藏、回答)
  app.router('list', async (ctx, next) => {
    try {
      const { type, } = event;
      // const user_unionid = UNIONID ? UNIONID : unionid
      const page = event.page ? Number(event.page) : 0;
      const pageSize = event.pageSize ? Number(event.pageSize) : 10;
      const skip = page * pageSize
      const now = Date.now();//当前时间戳
      if (typeList.indexOf(type) == -1) {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
        return;
      }

      let questions = null;
      let flag = "";//取自缓存还是数据库
      // 先看有没有问题ID列表的缓存
      const cacheKey = `user-questions:${type}:${UNIONID}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);
      const cacheData = await cacheUtil.redis.lrange(cacheKey, 0, -1);
      if (cacheKeyExists && cacheData.length == 1 && cacheData[0] == 'EMPTY') {
        // 有缓存列表为空
        ctx.body = { code: 0, cacheKey, length: 0, msg: `${type}缓存结果空`, data: [] }
      } else {
        // 缓存的问题ID列表不为'EMPTY'或者没有问题ID列表的缓存
        if (cacheKeyExists && cacheData[0] != 'EMPTY') {
          // 问题ID列表取自缓存
          flag = "cache";
          questions = cacheData
        } else {
          // 问题ID列表取自数据库
          flag = "database"
          const { data } = await db.collection('user-questions').where({
            // user_openid: OPENID, 
            user_unionid: UNIONID
          }).get();

          if (!data.length) {
            // 创建用户问题表user-questions
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
          questions = data[0] ? data[0][`${type}_questions`] : [];//对应类型的questions
        }

        // 问题ID列表的长度
        const questionLength = questions ? questions.length : 0
        if (questions && questionLength) {
          // user-questions有该用户的记录。并且记录里对应的[type]_questions字段数组有记录
          let result = []
          // 分页取出问题的详情(只取pageSize条数据即可)
          for (let index = skip; index < questionLength; index++) {
            if (result.length >= pageSize) {
              // 结束循环，只取pageSize条数据即可
              break;
            }
            // 缓存的数据需要先反序列化
            const { question_id: questionId } = flag == 'cache' ? JSON.parse(questions[index]) : questions[index];
            // const questionId = flag == 'cache' ? questions[index] : questions[index].question_id
            // 先看该问题详情是否有缓存
            const cacheQuestionKey = `question:detail:${questionId}:detail`
            const cacheQuestionKeyExists = await cacheUtil.redis.exists(cacheQuestionKey);//key是否存在
            const cacheQuestion = await cacheUtil.redis.hgetall(cacheQuestionKey);
            if (cacheQuestionKeyExists && Object.keys(cacheQuestion).length && cacheQuestion['empty'] != 'EMPTY') {
              if ((type == 'answered' || type == 'collected') && cacheQuestion.status != 'open') {
                // 收藏过的和回答过的只记录公开状态的问题
                result.push(cacheQuestion)
              } else {
                result.push(cacheQuestion)
              }

            } else {
              //没有该问题得到缓存, 调用另一个云函数获取问题的详情
              const { result: questionData } = await cloud.callFunction({
                name: 'question',
                data: {
                  $url: 'detail',
                  questionId: questionId,
                  notAddViewers: true
                }
              })

              if (questionData && questionData.data) {
                if ((type == 'answered' || type == 'collected') && questionData.data.status != 'open') {
                  // 收藏过的和回答过的只记录公开状态的问题
                  result.push(questionData.data)
                } else {
                  result.push(questionData.data)
                }
              }
            }
          }

          if (flag == 'database') {
            // 来自数据库的要缓存问题ID列表
            for (let index = 0; index < questions.length; index++) {
              cacheUtil.redis.rpush(cacheKey, JSON.stringify(questions[index]));
            }
          }
          // 返回结果
          ctx.body = {
            code: 0,
            msg: `读取${type}列表成功`,
            length: result.length,
            data: result
          }
        } else {
          // 问题ID列表为空时，设置缓存值为只包含特殊字符串'EMPTY'的数组
          await cacheUtil.redis.rpush(cacheKey, 'EMPTY', () => {
            // cacheUtil.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
          })
          ctx.body = {
            code: 0,
            msg: '没有数据',
            data: [],
            length: 0
          }

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
        url: event.$url

      });
    }
    //await cacheUtil.redis.quit();
  })


  // :add 添加相关行为的问题ID列表(创建、收藏、回答)
  app.router('add', async (ctx, next) => {
    try {
      const { type, questionId, unionid, openid } = event;
      const user_unionid = UNIONID ? UNIONID : unionid
      const user_openid = OPENID ? OPENID : openid
      const now = Date.now();//当前时间戳
      const date = dateUtil.formatTime(new Date());//当前年-月-日
      if (typeList.indexOf(type) == -1) {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误`
        }
        return;
      }

      // 获取问题ID列表
      let questions = []
      let flag = "";//取自缓存还是数据库
      const cacheKey = `user-questions:${type}:${user_unionid}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);
      const cacheData = await cacheUtil.redis.lrange(cacheKey, 0, -1);
      if (cacheKeyExists && cacheData.length == 1 && cacheData[0] == 'EMPTY') {
        questions = []
      } else {
        // 缓存的问题ID列表不为'EMPTY'或者没有问题ID列表的缓存
        if (cacheKeyExists && cacheData[0] != 'EMPTY') {
          // 问题ID列表取自缓存
          flag = "cache";
          for (let index = 0; index < cacheData.length; index++) {
            questions.push(JSON.parse(cacheData[index]))
          }
        } else {
          // 问题ID列表取自数据库
          flag = "database"
          const { data } = await db.collection('user-questions').where({
            // user_openid: OPENID, 
            user_unionid: user_unionid
          }).get();
          if (!data.length) {
            // 创建用户问题表user-questions
            const result2 = await db.collection('user-questions').add({
              data: {
                create_time: now,
                user_unionid: user_unionid,
                user_openid: user_openid,
                answered_questions: [],
                collected_questions: [],
                created_questions: [],
                viewed_questions: []
              }
            });
          }
          questions = data[0] ? data[0][`${type}_questions`] : [];//对应类型的questions
          // 来自数据库的要缓存问题ID列表
          for (let index = 0; index < questions.length; index++) {
            await cacheUtil.redis.rpush(cacheKey, JSON.stringify(questions[index]));
          }
        }
      }

      const repeatQuestion = questions.filter(item => item.question_id == questionId)
      if (repeatQuestion && repeatQuestion.length) {
        // 已有重复问题
        ctx.body = {
          code: 1,
          msg: '重复问题',
        }
        return;
      }

      if (!questions.length) {
        // 问题ID列表为空时，先清掉缓存。避免缓存为['EMPTY']的情况
        await cacheUtil.redis.del(cacheKey);
      }

      // 插入数据库
      const newData = { question_id: questionId, add_time: now }
      db.collection('user-questions').where({
        // user_openid: OPENID, 
        user_unionid: user_unionid
      }).update({
        data: {
          [`${type}_questions`]: _.unshift([newData])
        }
      }).then(res => {
        // 插入数据库后还要插入缓存(头部)
        cacheUtil.redis.lpush(cacheKey, JSON.stringify(newData))
      }).catch(err => {
        ctx.body = { code: 1, msg: '添加问题ID列表失败', data: err }
        // 记录日志
        logger.error({
          type: error.name,
          message: error.message,
          url: event.$url
        });
      })

      ctx.body = { code: 0, msg: '添加问题ID列表成功', data: newData }
    } catch (error) {
      ctx.body = { code: 1, msg: '添加问题ID列表失败', data: error.message }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,

      });
    }
    // await cacheUtil.redis.quit();
  })


  // 移除相关行为的问题ID列表 (取消收藏)
  app.router('remove', async (ctx, next) => {
    try {
      const { type, questionId } = event;
      const now = Date.now();//当前时间戳
      // (只有取消收藏, 创建过的和回答过的问题记录都不能删除)
      if (type != 'collected') {
        ctx.body = {
          code: 1,
          msg: `类型${type}错误,只有取消收藏操作`
        }
        return;
      }
      if (!questionId) {
        ctx.body = { code: 1, msg: '问题ID不能为空', }
        return;
      }
      const cacheKey = `user-questions:${type}:${UNIONID}`
      await cacheUtil.redis.del(cacheKey);

      // 将collected_questions数组字段中等于questionId的元素移除掉
      const result = await db.collection('user-questions').where({
        // user_openid: OPENID, 
        user_unionid: UNIONID
      }).update({
        data: {
          [`${type}_questions`]: _.pull({
            question_id: questionId,
          })
        }
      })

      ctx.body = { code: 0, msg: '取消收藏成功', }


    } catch (error) {
      ctx.body = { code: 1, msg: '取消收藏失败', data: error }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url
      });
    }
    // await cacheUtil.redis.quit();
  })

  //isDone (是否已收藏、回答过、创建者)
  app.router('isDone', async (ctx, next) => {
    try {
      const { type, questionId } = event;
      const now = Date.now();//当前时间戳
      if (!questionId) {
        ctx.body = { code: 1, msg: 'questionId不能为空', type }
        return;
      }
      // 获取问题ID列表
      let questions = [];
      let flag = "";//取自缓存还是数据库
      const cacheKey = `user-questions:${type}:${UNIONID}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);
      const cacheData = await cacheUtil.redis.lrange(cacheKey, 0, -1);
      if (cacheKeyExists && cacheData.length == 1 && cacheData[0] == 'EMPTY') {
        questions = []
        ctx.body = { code: 0, msg: '没有相关记录', type }
        return;
      } else {
        // 缓存的问题ID列表不为'EMPTY'或者没有问题ID列表的缓存
        if (cacheKeyExists && cacheData[0] != 'EMPTY') {
          // 问题ID列表取自缓存
          flag = "cache";
          for (let index = 0; index < cacheData.length; index++) {
            questions.push(JSON.parse(cacheData[index]))
          }
        } else {
          // 问题ID列表取自数据库
          flag = "database"
          const { data } = await db.collection('user-questions').where({
            // user_openid: OPENID, 
            user_unionid: UNIONID
          }).get();
          if (!data.length) {
            // 创建用户问题表user-questions
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
          questions = data[0] ? data[0][`${type}_questions`] : [];//对应类型的questions
        }
      }

      // 检测questionId是否在questions里
      const repeatQuestion = questions.filter(item => item.question_id == questionId)
      if (repeatQuestion && repeatQuestion.length) {
        // 已有该问题
        ctx.body = {
          code: 0,
          isDone: true,
          msg: '已有相关记录',
          type,
          data: repeatQuestion[0]
        }

      } else {
        // 还没有该问题(还未收藏过、回答过、创建者)
        ctx.body = {
          code: 0,
          isDone: false,
          msg: '还没有相关记录',
          type,
          data: {}
        }
      }

      if (flag == 'database') {
        //来自数据库的要缓存问题ID列表
        for (let index = 0; index < questions.length; index++) {
          await cacheUtil.redis.rpush(cacheKey, JSON.stringify(questions[index]));
        }
      }


    } catch (error) {
      ctx.body = { code: 1, msg: '查询失败', data: error.message }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url,
        type
      });
    }
    // await cacheUtil.redis.quit();
  })

  return app.serve();
}