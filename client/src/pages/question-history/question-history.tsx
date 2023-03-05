import Taro, { Config } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import './question-history.scss'

import Login from '../../components/login/index'

export default class Question-history extends Component<PropsWithChildren> {
  componentDidMount () { }

  componentWillUnmount () { }

  componentDidShow () { }

  componentDidHide () { }

  render () {
    return (
      <View className='question-history'>
        <Login/>
      </View>
    )
  }
}
