// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const TcbRouter = require('tcb-router')
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const cacheUtil = require('/opt/utils/cache.js') //redis 使用到了云函数的层管理
const dateUtil = require('/opt/utils/dateUtil.js') //时间相关的方法 使用到了云函数的层管理

const statusList = ['open', 'reviewing', 'closed', 'rejected']//【公开open, 审核中reviewing, 已关闭closed, 拒绝rejected】
// 云函数入口函数
exports.main = async (event, context) => {

  const collectionName = 'question'
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
      const { data } = await db.collection(collectionName).where({
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
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url

      });
    }
  })
  // 2.hot 热门问题(按回答人数)
  app.router('hot', async (ctx, next) => {
    try {
      const date = dateUtil.formatTime(new Date());//当前年-月-日
      const cacheKey = `question:hot:${date}:${page}:${pageSize}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey)//key是否存在

      if (cacheKeyExists) {
        const cacheData = await cacheUtil.redis.lrange(cacheKey, 0, -1);
        if (cacheData.length == 1 && cacheData[0] == 'EMPTY') {
          // 缓存结果为空
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果空', data: [] }
        } else {
          // 有缓存
          let result = []
          for (let index = 0; index < cacheData.length; index++) {
            // 解析数据
            const element = JSON.parse(cacheData[index]);
            result.push(element)
          }
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果', data: result }
        }

      } else {
        // 从数据库查询数据
        const { data } = await db.collection(collectionName).where({
          status: 'open',
          type: 'public'
        }).orderBy('total_answers', 'desc').skip(skip).limit(pageSize).field({
          create_time: true,
          title: true,
          total_answers: true,
          total_viewers: true,
          total_collectors: true,
        }).get();

        ctx.body = { code: 0, date, cacheKey, msg: '数据库结果', data }

        if (data && data.length) {
          // 循环遍历存储到redis
          for (let index = 0; index < data.length; index++) {
            // 时间戳转日期
            // data[index].create_time = dateUtil.toDate(data[index].create_time)
            // 序列化
            const element = JSON.stringify(data[index]);
            await cacheUtil.redis.rpush(cacheKey, element);
          }
          await cacheUtil.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
        } else {
          // 数据为空时，设置缓存值为只包含特殊字符串'EMPTY'的数组
          await cacheUtil.redis.rpush(cacheKey, 'EMPTY', () => {
            cacheUtil.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
          })
        }

      }


    } catch (error) {
      ctx.body = { code: 1, msg: '获取热门问题失败', data: error }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url

      });
    }
    // await cacheUtil.redis.quit();
  })
  // 3.latest 最新问题
  app.router('latest', async (ctx, next) => {
    try {
      const date = dateUtil.formatTime(new Date());//当前年-月-日
      const cacheKey = `question:latest:${date}:${page}:${pageSize}`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);//key是否存在

      if (cacheKeyExists) {
        const cacheData = await cacheUtil.redis.lrange(cacheKey, 0, -1);
        if (cacheData.length == 1 && cacheData[0] == 'EMPTY') {
          // 缓存结果为空
          ctx.body = { code: 0, date, cacheKey, msg: '缓存结果空', data: [] }
        } else {
          // 有缓存
          let result = []
          for (let index = 0; index < cacheData.length; index++) {
            // 解析数据
            const element = JSON.parse(cacheData[index]);
            result.push(element)
          }
          ctx.body = { code: 0, date, cacheKey, msg: '来自缓存结果', data: result }
        }

      } else {
        // 从数据库查询数据
        const { data } = await db.collection(collectionName).where({
          status: 'open',
          type: 'public'
        }).orderBy('create_time', 'desc').skip(skip).limit(pageSize).field({
          create_time: true,
          title: true,
          total_answers: true,
          total_viewers: true,
          total_collectors: true,
        }).get();

        ctx.body = { code: 0, date, cacheKey, msg: '数据库结果', data }

        if (data && data.length) {
          // 循环遍历存储到redis
          for (let index = 0; index < data.length; index++) {
            // 时间戳转日期
            // data[index].create_time = dateUtil.toDate(data[index].create_time)
            // 序列化
            const element = JSON.stringify(data[index]);
            await cacheUtil.redis.rpush(cacheKey, element);

          }
          await cacheUtil.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
        } else {
          // 数据为空时，设置缓存值为只包含特殊字符串'EMPTY'的数组
          await cacheUtil.redis.rpush(cacheKey, 'EMPTY', () => {
            cacheUtil.redis.expire(cacheKey, 60 * 60 * 24);//24小时过期
          })
        }

      }

    } catch (error) {
      ctx.body = { code: 1, msg: '获取最新问题失败', data: error }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url

      });
    }
    // await cacheUtil.redis.quit();
  })

  // 4.detail 问题详情
  app.router('detail', async (ctx, next) => {
    try {
      const { questionId, notAddViewers } = event

      if (!questionId) {
        ctx.body = { code: 1, msg: '问题ID不能为空', }
        return;
      }

      const date = dateUtil.formatTime(new Date());//当前年-月-日
      const cacheKey = `question:detail:${questionId}:detail`
      const cacheKeyExists = await cacheUtil.redis.exists(cacheKey);//key是否存在
      if (cacheKeyExists) {
        // 有缓存
        let cacheData = await cacheUtil.redis.hgetall(cacheKey)
        if (Object.keys(cacheData).length == 1 && cacheData['empty'] == 'EMPTY') {
          ctx.body = { code: 0, data: null, msg: '问题为空' }
        } else {
          // if (cacheData.status != 'open') {
          //   ctx.body = { code: 0, data: null, msg: '问题已关闭' }
          //   return;
          // }
          //取出缓存的问题option
          cacheData.options = []
          const optionKeys = await cacheUtil.redis.keys(`question:detail:${questionId}:option:*`)
          for (let index = 0; index < optionKeys.length; index++) {
            const optionKey = optionKeys[index];
            const optionData = await cacheUtil.redis.hgetall(optionKey)
            cacheData.options.push(optionData)
          }
          ctx.body = { code: 0, data: cacheData, msg: '成功返回' }
        }

      } else {
        // 从数据库查询数据
        const { data } = await db.collection(collectionName).where({
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
          ctx.body = { code: 0, data: data[0], msg: '成功返回' }

          // 将数组options 缓存到另一hash表中
          let result = { ...data[0] }
          if (result.options) {
            const options = result.options
            for (let index = 0; index < options.length; index++) {
              const optionItem = options[index];
              const optionCacheKey = `question:detail:${questionId}:option:${index}`
              await cacheUtil.redis.hset(optionCacheKey, optionItem)
            }
            // 删掉options
            delete result.options
          }
          // 把不包括options的结果缓存起来
          await cacheUtil.redis.hset(cacheKey, result)
        } else {
          ctx.body = { code: 0, data: null, msg: '问题为空' }
          // 空数据，设置缓存为特殊的{empty:'EMPTY'}
          await cacheUtil.redis.hset(cacheKey, 'empty', 'EMPTY')
        }
      }

      // 记录今天的浏览数加1
      if (!notAddViewers) {
        cacheUtil.redis.pfadd(`today:${date}:${questionId}:viewers`, UNIONID, res => {
          cacheUtil.redis.expire(`today${date}:${questionId}:viewers`, 60 * 60 * 48);//保留48小时
        })
      }


    } catch (error) {
      ctx.body = { code: 1, msg: '读取问题详情失败', data: error }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url

      });
    }
    // await cacheUtil.redis.quit();
  })

  // 5.delQuestionCache 删除问题详情的缓存
  app.router('delQuestionCache', async (ctx, next) => {
    try {
      const { questionId } = event
      // 批量删除与该问题详情相关的key
      cacheUtil.redis.keys(`question:detail:${questionId}:*`).then(function (keys) {
        let pipeline = cacheUtil.redis.pipeline();
        keys.forEach(function (key) {
          pipeline.del(key);
        });
        pipeline.exec();
      });
      ctx.body = { code: 0, msg: '删除问题详情的缓存成功' }

    } catch (error) {
      ctx.body = { code: 1, msg: '删除问题详情的缓存失败', data: error }
    }
    // await cacheUtil.redis.quit();
  })

  // 6.create 创建问题
  app.router('create', async (ctx, next) => {
    try {
      const now = Date.now();//当前时间戳
      const { options, title } = event
      // 对传入内容进行规则校验
      if (!title || title.length > 20) {
        ctx.body = { code: 1, msg: '问题不符合要求' }
        return;
      }
      if (options.length != 2 || !options[0].title || options[0].title.lengt > 15 || !options[1].title || options[1].title.lengt > 15) {
        ctx.body = { code: 1, msg: '选项不符合要求' }
        return;
      }

      // 对传入内容进行安全检测
      const result1 = await cloud.openapi.security.msgSecCheck({
        "openid": OPENID,
        "scene": 1,
        "version": 2,
        "content": title
      })

      const result2 = await cloud.openapi.security.msgSecCheck({
        "openid": OPENID,
        "scene": 1,
        "version": 2,
        "content": options[0].title
      })
      const result3 = await cloud.openapi.security.msgSecCheck({
        "openid": OPENID,
        "scene": 1,
        "version": 2,
        "content": options[1].title
      })
      console.log("内容安全检测result1", result1);
      console.log("内容安全检测result2", result2);
      console.log("内容安全检测result3", result3);
      // 问题或选项有一个不是pass状态就将status设置为reviewing,否则自动通过
      let status = "open";//默认为open【公开open, 审核中reviewing, 已关闭closed, 拒绝rejected】
      if (result1.result.suggest != 'pass' || result2.result.suggest != 'pass' || result3.result.suggest != 'pass') {
        status = "reviewing";//审核
      }

      const finalOptions = [
        {
          id: 0,
          update_time: now,
          create_time: now,
          total_answers: 0,
          title: options[0].title
        },
        {
          id: 1,
          update_time: now,
          create_time: now,
          total_answers: 0,
          title: options[1].title
        }
      ]

      const newQuestion = {
        update_time: now,
        create_time: now,
        creator_id: "",
        creator_openid: OPENID,
        creator_unionid: UNIONID,
        options: finalOptions,
        status,
        title,
        total_answers: 0,
        total_collectors: 0,
        total_viewers: 0,
        type: 'public',

        // prefix_words:'',
        // central_words: "",
        // suffix_words: "",
        // category: '',
        // tag:'',
      }

      // 创建新问题
      db.collection(collectionName).add({
        data: newQuestion
      }).then(async data => {
        if (data['_id']) {
          // 把问题ID保存到集合user-questions的created_questions和对应的缓存中去
          cloud.callFunction({
            name: 'user-questions',
            data: {
              $url: 'add',
              questionId: data['_id'],
              type: "created",
              unionid: UNIONID
            }
          }).then(res => { })
        }
      })

      ctx.body = { code: 0, msg: '创建新问题成功' }

    } catch (error) {
      ctx.body = { code: 1, msg: '创建问题失败', data: error }
      // 记录日志
      logger.error({
        type: error.name,
        message: error.message,
        url: event.$url

      });
    }

  })


  // TODO: 6.today 问题今天的数据(来自redis)
  app.router('today', async (ctx, next) => {
    try {
      // (redis有效期24小时)
      const date = dateUtil.formatTime(new Date());//当前年-月-日
      // 今天的浏览人数
      const viewers = cacheUtil.redis.pfcount(`today:${date}:${questionId}:viewers`)
      //今天的回答数
      const answers = cacheUtil.redis.get(`today:${date}:${questionId}:answers`)
      // 今天的收藏数
      const collectors = cacheUtil.redis.get(`today:${date}:${questionId}:collectors`)

      const todayData = {
        viewers,
        answers,
        collectors
      }
      ctx.body = { code: 0, msg: '成功读取问题今天的数据', data: todayData }
    } catch (error) {
      ctx.body = {
        code: 1, msg: '读取问题详情失败', data: {
          viewers: 0,
          answers: 0,
          collectors: 0
        }
      }
    }
    // await cacheUtil.redis.quit();
  })

  //TODO 7.history 问题过往的历史记录 (redis24小时过期)
  app.router('history', async (ctx, next) => {
    try {


    } catch (error) {
      ctx.body = { code: 1, msg: '读取问题历史失败', data: error }
    }
    // await cacheUtil.redis.quit();
  })

  // TODO: 修改问题的状态【公开open, 审核中reviewing, 已关闭closed, 拒绝rejected】
  app.router('updateStatus', async (ctx, next) => {
    try {
      const { questionId, status } = event

      const date = dateUtil.formatTime(new Date());//当前年-月-日
      // const cacheKey = `question:today:${date}:${questionId}`
      // TODO:必须问题创建者才能修改状态

      // TODO:修改状态成功后，需要清除掉该问题详情的缓存
    } catch (error) {
      ctx.body = { code: 1, msg: '读取问题详情失败', data: error }
    }
    // await cacheUtil.redis.quit();


  })







  return app.serve();
}