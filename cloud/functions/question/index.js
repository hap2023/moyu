// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const cache = require('/opt/utils/cache.js') // 使用到了云函数的层管理
const dateUtil = require('/opt/utils/dateUtil.js') // 使用到了云函数的层管理

// 云函数入口函数
exports.main = async (event, context) => {

  const app = new TcbRouter({ event })
  // const { } = event
  const { OPENID, UNIONID } = cloud.getWXContext()
  const page = event.page ? Number(event.page) : 0;
  const pageSize = event.pageSize ? Number(event.pageSize) : 10;
  const skip = page * pageSize

  app.use(async (ctx, next) => {
    ctx.data = {}
    await next();
  });

  // 1.search 搜索问题
  app.router('search', async (ctx, next) => {
    try {
      const { searchText } = event
      // 从数据库查询数据
      const { data } = await db.collection('question').where({
        title: db.RegExp({
          regexp: searchText,
          options: 'i',
        }),
        status: 'open',
        type: 'public'
      })
        .orderBy('total_answers', 'desc')
        .skip(page * pageSize).limit(pageSize)
        .field({
          title: true,
          total_answers: true,
          total_viewers: true,
          total_collectors: true,
        })
        .get();
      ctx.body = { code: 0, msg: '数据库结果', data, }

      // 从redis查询数据


    } catch (error) {
      ctx.body = { code: 1, msg: '搜索问题失败', data: error }
    }
  })
  // 2.hot 热门问题(按回答人数)
  app.router('hot', async (ctx, next) => {
    try {
      const date = dateUtil.formatTime(new Date());//当前日期
      const cacheKey = `question:hot:${date}:${page}:${pageSize}`
      const cacheKeyExists = await cache.redis.exists(cacheKey)//key是否存在

      if (cacheKeyExists) {
        const cacheData = await cache.redis.lrange(cacheKey, 0, -1);
        if (cacheData.length == 1 && cacheData[0] == 'EMPTY') {
          // 缓存结果为空
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果空', data: [] }
        } else {
          // 有缓存
          let result = []
          for (let index = 0; index < cacheData.length; index++) {
            const element = JSON.parse(cacheData[index]);
            result.push(element)
          }
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果', data: result }
        }

      } else {
        // 从数据库查询数据
        const { data } = await db.collection('question').where({
          status: 'open',
          type: 'public'
        }).orderBy('total_answers', 'desc').skip(skip).limit(pageSize).field({
          create_time: true,
          title: true,
          total_answers: true,
          total_viewers: true,
          total_collectors: true,
        }).get();

        if (data && data.length) {
          // 循环遍历存储到redis
          for (let index = 0; index < data.length; index++) {
            // 时间戳转日期
            data[index].create_time = dateUtil.toDate(data[index].create_time)
            const element = JSON.stringify(data[index]);
            await cache.redis.rpush(cacheKey, element);
          }
          await cache.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
        } else {
          // 数据为空时，设置缓存值为特殊字符串'EMPTY'
          await cache.redis.rpush(cacheKey, 'EMPTY', () => {
            cache.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
          })
        }
        ctx.body = { code: 0, date, cacheKey, msg: '数据库结果', data }
      }

    } catch (error) {
      ctx.body = { code: 1, msg: '获取热门问题失败', data: error }
    }

  })
  // 3.latest 最新问题
  app.router('latest', async (ctx, next) => {
    try {
      const date = dateUtil.formatTime(new Date());//当前日期
      const cacheKey = `question:latest:${date}:${page}:${pageSize}`
      const cacheKeyExists = await cache.redis.exists(cacheKey);//key是否存在

      if (cacheKeyExists) {
        const cacheData = await cache.redis.lrange(cacheKey, 0, -1);
        if (cacheData.length == 1 && cacheData[0] == 'EMPTY') {
          // 缓存结果为空
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果空', data: [] }
        } else {
          // 有缓存
          let result = []
          for (let index = 0; index < cacheData.length; index++) {
            const element = JSON.parse(cacheData[index]);
            result.push(element)
          }
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果', data: result }
        }

      } else {
        // 从数据库查询数据
        const { data } = await db.collection('question').where({
          status: 'open',
          type: 'public'
        }).orderBy('create_time', 'desc').skip(skip).limit(pageSize).field({
          create_time: true,
          title: true,
          total_answers: true,
          total_viewers: true,
          total_collectors: true,
        }).get();

        if (data && data.length) {
          // 循环遍历存储到redis
          for (let index = 0; index < data.length; index++) {
            // 时间戳转日期
            data[index].create_time = dateUtil.toDate(data[index].create_time)
            const element = JSON.stringify(data[index]);
            await cache.redis.rpush(cacheKey, element);

          }
          await cache.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
        } else {
          // 数据为空时，设置缓存值为特殊字符串'EMPTY'
          await cache.redis.rpush(cacheKey, 'EMPTY', () => {
            cache.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
          })
        }

        ctx.body = { code: 0, date, cacheKey, msg: '数据库结果', data }
      }

    } catch (error) {
      ctx.body = { code: 1, msg: '获取最新问题失败', data: error }
    }
  })

  // 4.detail 问题详情
  app.router('detail', async (ctx, next) => {
    try {
      const { questionId } = event


      const date = dateUtil.formatTime(new Date());//当前日期
      const cacheKey = `question:detail:${questionId}:detail`
      const cacheKeyExists = await cache.redis.exists(cacheKey);//key是否存在
      if (cacheKeyExists) {
        // 有缓存
        let cacheData = await cache.redis.hgetall(cacheKey)
        if (Object.keys(cacheData).length == 1 && cacheData['empty'] == 'EMPTY') {
          ctx.body = { code: 0, msg: '缓存空空', data: null }
        } else {
          //取出缓存的问题option
          cacheData.options = []
          const optionKeys = await cache.redis.keys(`question:detail:${questionId}:option:*`)
          for (let index = 0; index < optionKeys.length; index++) {
            const optionKey = optionKeys[index];
            const optionData = await cache.redis.hgetall(optionKey)
            cacheData.options.push(optionData)
          }
          ctx.body = { code: 0, msg: '缓存结果', data: cacheData }
        }

      } else {
        // 从数据库查询数据
        const { data } = await db.collection('question').where({
          _id: questionId
        }).field({
          create_time: true,
          creator_unionid: true,
          title: true,
          total_answers: true,
          total_viewers: true,
          total_collectors: true,
          status: true,
          options: true,
        }).get();

        if (data && data.length) {
          // 返回问题详情
          ctx.body = { code: 0, msg: '数据库结果', data: data[0] }

          // 将数组options 缓存到另一hash表中
          let result = { ...data[0] }
          if (result.options) {
            const options = result.options
            for (let index = 0; index < options.length; index++) {
              const optionItem = options[index];
              const optionCacheKey = `question:detail:${questionId}:option:${index}`
              await cache.redis.hset(optionCacheKey, optionItem)
            }
            // 删掉options
            delete result.options
          }
          // 把结果缓存起来
          await cache.redis.hset(cacheKey, result)
        } else {
          ctx.body = { code: 0, msg: '数据库结果为空', data: {} }
          // 空数据，设置缓存为特殊的{empty:'EMPTY'}
          await cache.redis.hset(cacheKey, 'empty', 'EMPTY')
        }
      }

      // 记录今天的浏览数加1
      cache.redis.pfadd(`question:today:${date}:${questionId}:viewers`, UNIONID, res => {
        cache.redis.expire(`question:today${date}:${questionId}:viewers`, 60 * 60 * 48);//保留48小时
      })

    } catch (error) {
      ctx.body = { code: 1, msg: '读取问题详情失败', data: error }
    }
  })

  // 5.delQuestionCache 删除问题详情的缓存
  app.router('delQuestionCache', async (ctx, next) => {
    try {
      const { questionId } = event
      // 批量删除与改问题详情相关的key
      cache.redis.keys(`question:detail:${questionId}:*`).then(function (keys) {
        let pipeline = cache.redis.pipeline();
        keys.forEach(function (key) {
          pipeline.del(key);
        });
        pipeline.exec();
      });
      ctx.body = { code: 0, msg: '删除问题详情的缓存成功' }

    } catch (error) {
      ctx.body = { code: 1, msg: '删除问题详情的缓存失败', data: error }
    }
  })


  // TODO: 6.today 问题今天的数据(来自redis)
  app.router('today', async (ctx, next) => {
    try {
      // (redis有效期24小时)
      const date = dateUtil.formatTime(new Date());//当前日期
      const cacheKey = `question:today:${date}:${questionId}`



    } catch (error) {
      ctx.body = { code: 1, msg: '读取问题详情失败', data: error }
    }
  })

  //TODO 7.history 问题过往的详情 (redis24小时过期)
  app.router('history', async (ctx, next) => {
    try {


    } catch (error) {
      ctx.body = { code: 1, msg: '读取问题历史失败', data: error }
    }
  })




  return app.serve();
}