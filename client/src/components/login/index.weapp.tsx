import { Component, PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Button } from '@tarojs/components'

import { formatTime, toDate } from "../../utils/dateUtil";
export default class Index extends Component<PropsWithChildren> {
  state = {
    context: {}
  }

  componentDidMount() {
    const now = formatTime(new Date())
    console.log(now);
    // Taro.showToast({
    //   title: '成功',
    //   icon: 'success',
    //   duration: 2000
    // })
    // Taro.showLoading({
    //   title: '加载中',
    // })
    // setTimeout(function () {
    //   Taro.hideLoading()
    // }, 2000)

    Taro.cloud
      .callFunction({
        name: "user",
        data: {
          $url: 'info',

        }
      })
      .then(res => {
        console.log(res);
        console.log(res.result.data.create_time);
        const date = toDate(res.result.data.create_time)
        console.log(date);
      })
  }

  componentWillUnmount() { }

  componentDidShow() {

  }

  componentDidHide() { }

  getLogin = () => {
    Taro.cloud
      .callFunction({
        // name: "question",
        name: "user-questions",

        data: {
          $url: 'list',
          // $url: 'search',
          // $url: 'detail',
          // $url: 'hot',
          // questionId: '99b41a676404c4c40086db4536e3d9ca',
          // questionId: 'xsdgehqrhqehehehehe',
          // questionId: '0122a58763ff7a6c028434f62729cad8',
          // page: 0,
          // searchText: '测试',
          type: "collected"
        }
      })
      .then(res => {
        console.log(res);

        this.setState({
          context: res.result
        })
      })


  }

  render() {
    return (
      <View className='index'>
        <Button onClick={this.getLogin}>获取登录云函数</Button>
        <Text>context：{JSON.stringify(this.state.context)}</Text>

      </View>
    )
  }
}
