import Taro, { Config } from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import './question.scss'

import Login from '../../components/login/index'

export default class Question extends Component<PropsWithChildren> {
  componentDidMount () { }

  componentWillUnmount () { }

  componentDidShow () { }

  componentDidHide () { }

  render () {
    return (
      <View className='question'>
        <Login/>
      </View>
    )
  }
}
